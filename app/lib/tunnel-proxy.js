/**
 * rslvd Multi-Protocol Tunnel Proxy
 *
 * Supports TCP, UDP, and DNS2TCP tunnels
 *
 * TCP Tunnels (ports 7000/7001):
 *   Control port 7000: tunnel clients connect, send "HELLO <token>\n"
 *   Data port 7001: for each inbound public connection, client opens data connection
 *   Public traffic port 8080: HTTP/WebSocket proxy routed by Host header
 *
 * UDP Tunnels (ports 7100/7101):
 *   Control port 7100: UDP registration with "HELLO <token>\n"
 *   Data port 7101: UDP packet relay between public and client
 *   Public UDP port 8081: receives UDP packets, routes by source address
 *
 * DNS2TCP (port 7200):
 *   DNS server on port 7200 (UDP/TCP)
 *   Encodes TCP data in DNS TXT queries/responses
 *   Bypasses captive portals and restrictive firewalls
 */

const net  = require('net');
const dgram = require('dgram');
const pool = require('../db/pool');

// Base32hex (RFC 4648) decoder — matches Go's base32.HexEncoding used by the tunnel client
const B32HEX = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
function decodeBase32Hex(str) {
  str = str.replace(/=+$/, '').toUpperCase();
  const out = [];
  let bits = 0, value = 0;
  for (const ch of str) {
    const idx = B32HEX.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((value >>> bits) & 0xff); }
  }
  return Buffer.from(out);
}

// TCP Tunnel ports
const TCP_CONTROL_PORT = 7000;
const TCP_DATA_PORT    = 7001;
const TCP_PUBLIC_PORT  = 8080;

// UDP Tunnel ports
const UDP_CONTROL_PORT = 7100;
const UDP_DATA_PORT    = 7101;
const UDP_PUBLIC_PORT  = 8081;

// DNS2TCP port
const DNS2TCP_PORT = 7200;

// fqdn → { token, protocol, controlConn, pendingDataConns: [], udpClientAddr }
const clients = new Map();
// token → fqdn (reverse index)
const tokenToFqdn = new Map();
// UDP session tracking: clientAddr -> { fqdn, lastSeen }
const udpSessions = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(...args) {
  console.log(`[tunnel-proxy]`, ...args);
}

function sendLine(socket, line) {
  try { socket.write(line + '\n'); } catch (_) {}
}

function readLineRaw(socket, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
      reject(new Error('handshake timeout'));
    }, timeoutMs);

    function finish(line, leftover) {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
      resolve({ line: line.toString('utf8').replace(/\r$/, ''), leftover });
    }

    function onData(chunk) {
      buf = Buffer.concat([buf, chunk]);
      const nl = buf.indexOf(0x0a);
      if (nl !== -1) {
        const line = buf.slice(0, nl);
        const leftover = buf.slice(nl + 1);
        finish(line, leftover);
      }
    }
    function onError(err) {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('close', onClose);
      reject(err);
    }
    function onClose() {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      reject(new Error('socket closed'));
    }

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

// ── TCP Control Server (port 7000) ──────────────────────────────────────────────

const tcpControlServer = net.createServer(async (conn) => {
  conn.setKeepAlive(true, 30000);
  const remote = `${conn.remoteAddress}:${conn.remotePort}`;
  log(`TCP Control connect from ${remote}`);

  let helloLine;
  try {
    const { line } = await readLineRaw(conn);
    helloLine = line.trim();
  } catch (e) {
    conn.destroy();
    return;
  }

  if (!helloLine.startsWith('HELLO ')) {
    sendLine(conn, 'ERR expected HELLO');
    conn.destroy();
    return;
  }

  const token = helloLine.slice(6).trim();

  let row;
  try {
    const result = await pool.query(
      'SELECT id, fqdn, protocol, status FROM tunnels WHERE token = $1 AND active = TRUE',
      [token]
    );
    row = result.rows[0];
  } catch (e) {
    sendLine(conn, 'ERR database error');
    conn.destroy();
    return;
  }

  if (!row) {
    sendLine(conn, 'ERR invalid token');
    conn.destroy();
    return;
  }

  const fqdn = row.fqdn;
  const protocol = row.protocol || 'tcp';

  // Kick existing client for same fqdn
  if (clients.has(fqdn)) {
    const existing = clients.get(fqdn);
    try { existing.controlConn.destroy(); } catch (_) {}
    tokenToFqdn.delete(existing.token);
  }

  clients.set(fqdn, { token, protocol, controlConn: conn, pendingDataConns: [], udpClientAddr: null });
  tokenToFqdn.set(token, fqdn);

  pool.query('UPDATE tunnels SET status = $1 WHERE token = $2', ['active', token]).catch(() => {});
  sendLine(conn, 'OK');
  log(`TCP Tunnel registered: ${fqdn} (${protocol})`);

  // Keepalive
  let pingBuf = Buffer.alloc(0);
  conn.on('data', (chunk) => {
    pingBuf = Buffer.concat([pingBuf, chunk]);
    let nl;
    while ((nl = pingBuf.indexOf(0x0a)) !== -1) {
      const msg = pingBuf.slice(0, nl).toString('utf8').trim();
      pingBuf = pingBuf.slice(nl + 1);
      if (msg === 'PING') sendLine(conn, 'PONG');
    }
  });

  conn.on('close', () => {
    log(`TCP Control disconnect: ${fqdn}`);
    const entry = clients.get(fqdn);
    if (entry && entry.controlConn === conn) {
      for (const pc of entry.pendingDataConns) { try { pc.destroy(); } catch (_) {} }
      clients.delete(fqdn);
      tokenToFqdn.delete(token);
      pool.query('UPDATE tunnels SET status = $1 WHERE token = $2', ['inactive', token]).catch(() => {});
    }
  });

  conn.on('error', (err) => log(`TCP Control error ${fqdn}: ${err.message}`));
});

// ── TCP Data Server (port 7001) ─────────────────────────────────────────────────

const tcpDataServer = net.createServer(async (dataConn) => {
  dataConn.setKeepAlive(true, 10000);

  let dataLine, leftover;
  try {
    ({ line: dataLine, leftover } = await readLineRaw(dataConn, 10000));
    dataLine = dataLine.trim();
  } catch (e) {
    dataConn.destroy();
    return;
  }

  if (!dataLine.startsWith('DATA ')) {
    dataConn.destroy();
    return;
  }

  const token = dataLine.slice(5).trim();
  const fqdn  = tokenToFqdn.get(token);
  const entry = fqdn && clients.get(fqdn);
  if (!entry || entry.pendingDataConns.length === 0) {
    dataConn.destroy();
    return;
  }

  const { publicConn, headBytes } = entry.pendingDataConns.shift();

  sendLine(dataConn, 'GO');
  publicConn.resume();

  if (headBytes && headBytes.length > 0) dataConn.write(headBytes);
  if (leftover  && leftover.length  > 0) publicConn.write(leftover);

  dataConn.pipe(publicConn);
  publicConn.pipe(dataConn);

  publicConn.on('close', () => { try { dataConn.destroy();   } catch (_) {} });
  dataConn.on('close',   () => { try { publicConn.destroy(); } catch (_) {} });
  publicConn.on('error', () => { try { dataConn.destroy();   } catch (_) {} });
  dataConn.on('error',   () => { try { publicConn.destroy(); } catch (_) {} });
});

// ── TCP Public HTTP/WS Proxy (port 8080) ──────────────────────────────────────

const tcpPublicServer = net.createServer(async (publicConn) => {
  publicConn.pause();

  let buf = Buffer.alloc(0);
  let fqdn = null;
  const TIMEOUT = 10000;

  const timer = setTimeout(() => {
    if (!fqdn) { publicConn.destroy(); }
  }, TIMEOUT);

  function tryRoute() {
    const text = buf.toString('ascii');
    const m = text.match(/^Host:\s*([^\r\n:]+)/im);
    if (!m) {
      if (buf.length > 8192) {
        clearTimeout(timer);
        publicConn.destroy();
      }
      return;
    }

    clearTimeout(timer);
    publicConn.removeListener('data', onData);
    publicConn.removeListener('error', onError);

    fqdn = m[1].trim().toLowerCase();

    const entry = clients.get(fqdn);
    if (!entry) {
      publicConn.resume();
      publicConn.write(
        'HTTP/1.1 502 No Tunnel\r\n' +
        'Content-Type: text/plain\r\n' +
        'Connection: close\r\n\r\n' +
        `No tunnel is connected for ${fqdn}\n`
      );
      publicConn.end();
      return;
    }

    sendLine(entry.controlConn, 'CONNECT');
    entry.pendingDataConns.push({ publicConn, headBytes: buf });

    setTimeout(() => {
      const idx = entry.pendingDataConns.findIndex(p => p.publicConn === publicConn);
      if (idx !== -1) {
        entry.pendingDataConns.splice(idx, 1);
        publicConn.destroy();
      }
    }, 10000);
  }

  function onData(chunk) {
    buf = Buffer.concat([buf, chunk]);
    tryRoute();
  }
  function onError() { clearTimeout(timer); }

  publicConn.on('data', onData);
  publicConn.on('error', onError);
  publicConn.resume();
});

// ── UDP Control Server (port 7100) ──────────────────────────────────────────────

const udpControlSocket = dgram.createSocket('udp4');

udpControlSocket.on('message', async (msg, rinfo) => {
  const msgStr = msg.toString('utf8').trim();
  
  if (!msgStr.startsWith('HELLO ')) return;
  
  const token = msgStr.slice(6).trim();
  
  let row;
  try {
    const result = await pool.query(
      'SELECT id, fqdn, protocol FROM tunnels WHERE token = $1 AND active = TRUE',
      [token]
    );
    row = result.rows[0];
  } catch (e) {
    udpControlSocket.send('ERR database\n', rinfo.port, rinfo.address);
    return;
  }

  if (!row) {
    udpControlSocket.send('ERR invalid token\n', rinfo.port, rinfo.address);
    return;
  }

  const fqdn = row.fqdn;
  const clientAddr = `${rinfo.address}:${rinfo.port}`;
  
  // Update or create UDP session
  const existing = clients.get(fqdn);
  if (existing) {
    try { existing.controlConn.destroy(); } catch (_) {}
  }
  
  // For UDP, we store the client address and use it for routing
  clients.set(fqdn, { 
    token, 
    protocol: 'udp', 
    controlConn: null,
    udpClientAddr: { address: rinfo.address, port: rinfo.port },
    pendingDataConns: [] 
  });
  tokenToFqdn.set(token, fqdn);
  udpSessions.set(clientAddr, { fqdn, lastSeen: Date.now() });
  
  pool.query('UPDATE tunnels SET status = $1 WHERE token = $2', ['active', token]).catch(() => {});
  udpControlSocket.send('OK\n', rinfo.port, rinfo.address);
  log(`UDP Tunnel registered: ${fqdn} from ${clientAddr}`);
});

udpControlSocket.on('error', (err) => log(`UDP Control error: ${err.message}`));

// ── UDP Data/Public Server (port 7101) ─────────────────────────────────────────

const udpDataSocket = dgram.createSocket('udp4');

udpDataSocket.on('message', (msg, rinfo) => {
  const senderAddr = `${rinfo.address}:${rinfo.port}`;
  
  // Check if this is from a registered UDP client
  const session = udpSessions.get(senderAddr);
  
  if (session) {
    // Message from tunnel client - forward to local service (via client)
    session.lastSeen = Date.now();
    // The client is responsible for forwarding to the local UDP service
    // We just acknowledge receipt
  } else {
    // Message from public internet - route to tunnel client
    // Find tunnel by destination port (simplified - in production you'd map ports to fqdns)
    for (const [fqdn, entry] of clients) {
      if (entry.protocol === 'udp' && entry.udpClientAddr) {
        // Forward to tunnel client
        udpDataSocket.send(msg, entry.udpClientAddr.port, entry.udpClientAddr.address);
        break;
      }
    }
  }
});

udpDataSocket.on('error', (err) => log(`UDP Data error: ${err.message}`));

// ── DNS2TCP Server (port 7200) ─────────────────────────────────────────────────

// DNS2TCP encodes TCP data in DNS TXT records
// Client sends: base32-encoded data in subdomain: <data>.tunnel-id.rslvd.net
// Server responds: TXT record with encoded response data

const dns2tcpSocket = dgram.createSocket('udp4');
const dns2tcpSessions = new Map(); // sessionId -> { clientAddr, localPort, buffer }

function encodeDNSResponse(requestId, data) {
  // Simple DNS response encoding
  // In production, implement proper DNS packet encoding
  return Buffer.from(`DNS2TCP_RESPONSE:${data.toString('base64')}`);
}

function parseDNSQuery(msg) {
  // Parse DNS query packet
  // Returns { sessionId, data, isDataPacket }
  try {
    // Minimal DNS parsing - extract QNAME
    let offset = 12; // Skip header
    const labels = [];
    
    while (offset < msg.length) {
      const len = msg[offset];
      if (len === 0) break;
      if (len > 63) return null; // Compression pointer or invalid
      labels.push(msg.slice(offset + 1, offset + 1 + len).toString('ascii'));
      offset += 1 + len;
    }
    
    const qname = labels.join('.');
    // Expected format: <data>.<session>.tunnel.rslvd.net or <session>.tunnel.rslvd.net
    const parts = qname.split('.');
    
    if (parts.length >= 3 && parts[parts.length - 3] === 'tunnel') {
      const sessionId = parts[parts.length - 2];
      const data = parts.length > 3 ? decodeBase32Hex(parts[0]) : null;
      return { sessionId, data, qname };
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

dns2tcpSocket.on('message', async (msg, rinfo) => {
  const query = parseDNSQuery(msg);
  if (!query) return;
  
  const { sessionId, data } = query;
  
  if (data) {
    // Data packet - forward to local service via existing session
    const session = dns2tcpSessions.get(sessionId);
    if (session && session.tcpConn) {
      session.tcpConn.write(data);
    } else {
      // New session - establish TCP connection to local service
      // Extract target port from token lookup
      try {
        const result = await pool.query(
          'SELECT target_port FROM tunnels WHERE token = $1 AND active = TRUE',
          [sessionId]
        );
        if (result.rows[0]) {
          const targetPort = result.rows[0].target_port;
          const tcpConn = net.createConnection({ port: targetPort, host: 'localhost' });
          
          tcpConn.on('connect', () => {
            tcpConn.write(data);
            dns2tcpSessions.set(sessionId, { 
              clientAddr: rinfo, 
              tcpConn,
              buffer: Buffer.alloc(0)
            });
          });
          
          tcpConn.on('data', (tcpData) => {
            // Send response via DNS TXT
            const response = encodeDNSResponse(sessionId, tcpData);
            dns2tcpSocket.send(response, rinfo.port, rinfo.address);
          });
          
          tcpConn.on('close', () => {
            dns2tcpSessions.delete(sessionId);
          });
          
          tcpConn.on('error', (err) => {
            log(`DNS2TCP connection error: ${err.message}`);
            dns2tcpSessions.delete(sessionId);
          });
        }
      } catch (e) {
        log(`DNS2TCP error: ${e.message}`);
      }
    }
  }
});

dns2tcpSocket.on('error', (err) => log(`DNS2TCP error: ${err.message}`));

// ── Start ─────────────────────────────────────────────────────────────────────

function startTunnelProxy() {
  // TCP servers
  tcpControlServer.listen(TCP_CONTROL_PORT, '0.0.0.0', () => {
    log(`TCP Control server listening on :${TCP_CONTROL_PORT}`);
  });
  tcpDataServer.listen(TCP_DATA_PORT, '0.0.0.0', () => {
    log(`TCP Data server listening on :${TCP_DATA_PORT}`);
  });
  tcpPublicServer.listen(TCP_PUBLIC_PORT, '127.0.0.1', () => {
    log(`TCP Public proxy listening on :${TCP_PUBLIC_PORT}`);
  });
  
  // UDP servers
  udpControlSocket.bind(UDP_CONTROL_PORT, '0.0.0.0', () => {
    log(`UDP Control server listening on :${UDP_CONTROL_PORT}`);
  });
  udpDataSocket.bind(UDP_DATA_PORT, '0.0.0.0', () => {
    log(`UDP Data server listening on :${UDP_DATA_PORT}`);
  });
  
  // DNS2TCP server
  dns2tcpSocket.bind(DNS2TCP_PORT, '0.0.0.0', () => {
    log(`DNS2TCP server listening on :${DNS2TCP_PORT}`);
  });
  
  // Error handlers
  tcpControlServer.on('error', (e) => log(`TCP Control server error: ${e.message}`));
  tcpDataServer.on('error',    (e) => log(`TCP Data server error: ${e.message}`));
  tcpPublicServer.on('error',  (e) => log(`TCP Public server error: ${e.message}`));
}

module.exports = { startTunnelProxy };
