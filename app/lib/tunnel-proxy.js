/**
 * rslvd TCP Tunnel Proxy
 *
 * Control port 7000: tunnel clients connect, send "HELLO <token>\n"
 *   → responds "OK\n" or "ERR <reason>\n"
 *   → stays open; server sends "CONNECT\n" when a public HTTP/WS request arrives
 *   → client sends "PING\n" for keepalive; server replies "PONG\n"
 *
 * Data port 7001: for each inbound public connection, client opens one data connection
 *   → sends "DATA <token>\n"
 *   → server replies "GO\n" then bridges the two sockets
 *
 * Public traffic port 8080: nginx proxies *.rslvd.net here.
 *   The proxy peeks at the Host header (HTTP) or buffers the raw bytes,
 *   looks up the tunnel by fqdn, signals the client via CONNECT,
 *   then splices the public socket to the client's data socket — replaying
 *   the already-read bytes so the local service sees the complete request.
 */

const net  = require('net');
const pool = require('../db/pool');

const CONTROL_PORT = 7000;
const DATA_PORT    = 7001;
const PUBLIC_PORT  = 8080;

// fqdn → { token, controlConn, pendingDataConns: [] }
const clients = new Map();
// token → fqdn  (reverse index for control/data lookup)
const tokenToFqdn = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(...args) {
  console.log(`[tunnel-proxy]`, ...args);
}

function sendLine(socket, line) {
  try { socket.write(line + '\n'); } catch (_) {}
}

/**
 * Read exactly one newline-terminated line from a socket without consuming
 * any bytes beyond it.  Returns { line, leftover } where leftover is a Buffer
 * of bytes that were read from the socket but belong to the next message.
 * This is critical for binary protocols (WebSocket) — readline/bufio both
 * over-read and silently discard the extra bytes.
 */
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
      const nl = buf.indexOf(0x0a); // '\n'
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

// ── Control server (port 7000) ────────────────────────────────────────────────

const controlServer = net.createServer(async (conn) => {
  conn.setKeepAlive(true, 30000);
  const remote = `${conn.remoteAddress}:${conn.remotePort}`;
  log(`Control connect from ${remote}`);

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
      'SELECT id, fqdn, status FROM tunnels WHERE token = $1 AND active = TRUE',
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

  // Kick existing client for same fqdn
  if (clients.has(fqdn)) {
    const existing = clients.get(fqdn);
    try { existing.controlConn.destroy(); } catch (_) {}
    tokenToFqdn.delete(existing.token);
  }

  clients.set(fqdn, { token, controlConn: conn, pendingDataConns: [] });
  tokenToFqdn.set(token, fqdn);

  pool.query('UPDATE tunnels SET status = $1 WHERE token = $2', ['active', token]).catch(() => {});
  sendLine(conn, 'OK');
  log(`Tunnel registered: ${fqdn}`);

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
    log(`Control disconnect: ${fqdn}`);
    const entry = clients.get(fqdn);
    if (entry && entry.controlConn === conn) {
      for (const pc of entry.pendingDataConns) { try { pc.destroy(); } catch (_) {} }
      clients.delete(fqdn);
      tokenToFqdn.delete(token);
      pool.query('UPDATE tunnels SET status = $1 WHERE token = $2', ['inactive', token]).catch(() => {});
    }
  });

  conn.on('error', (err) => log(`Control error ${fqdn}: ${err.message}`));
});

// ── Data server (port 7001) ───────────────────────────────────────────────────

const dataServer = net.createServer(async (dataConn) => {
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

  // Replay bytes the proxy already read (Host header peek + any leftover from client)
  if (headBytes && headBytes.length > 0) dataConn.write(headBytes);
  if (leftover  && leftover.length  > 0) publicConn.write(leftover);

  dataConn.pipe(publicConn);
  publicConn.pipe(dataConn);

  publicConn.on('close', () => { try { dataConn.destroy();   } catch (_) {} });
  dataConn.on('close',   () => { try { publicConn.destroy(); } catch (_) {} });
  publicConn.on('error', () => { try { dataConn.destroy();   } catch (_) {} });
  dataConn.on('error',   () => { try { publicConn.destroy(); } catch (_) {} });
});

// ── Public HTTP/WS proxy (port 8080) — routed by Host header ─────────────────

const publicServer = net.createServer(async (publicConn) => {
  publicConn.pause();

  // Buffer incoming bytes until we've seen a complete Host header line.
  // We never consume more than needed — everything is replayed to the tunnel client.
  let buf = Buffer.alloc(0);
  let fqdn = null;
  const TIMEOUT = 10000;

  const timer = setTimeout(() => {
    if (!fqdn) { publicConn.destroy(); }
  }, TIMEOUT);

  function tryRoute() {
    // Look for Host: header in buffered bytes (works for HTTP/1.x and WS upgrade)
    const text = buf.toString('ascii');
    const m = text.match(/^Host:\s*([^\r\n:]+)/im);
    if (!m) {
      // Need more data — but bail if we've buffered too much without finding it
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
      // No tunnel connected for this host — send a clean 502
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

    // Signal the tunnel client to open a data connection, park the public conn
    sendLine(entry.controlConn, 'CONNECT');
    entry.pendingDataConns.push({ publicConn, headBytes: buf });

    // Timeout if the client doesn't open a data connection in time
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

// ── Start ─────────────────────────────────────────────────────────────────────

function startTunnelProxy() {
  controlServer.listen(CONTROL_PORT, '0.0.0.0', () => {
    log(`Control server listening on :${CONTROL_PORT}`);
  });
  dataServer.listen(DATA_PORT, '0.0.0.0', () => {
    log(`Data server listening on :${DATA_PORT}`);
  });
  publicServer.listen(PUBLIC_PORT, '127.0.0.1', () => {
    log(`Public proxy listening on :${PUBLIC_PORT} (routed by Host header)`);
  });
  controlServer.on('error', (e) => log(`Control server error: ${e.message}`));
  dataServer.on('error',    (e) => log(`Data server error: ${e.message}`));
  publicServer.on('error',  (e) => log(`Public server error: ${e.message}`));
}

module.exports = { startTunnelProxy };
