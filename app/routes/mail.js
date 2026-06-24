const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const net = require('net');

const ENC_KEY = process.env.MAIL_ENC_KEY || process.env.JWT_SECRET;

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(ENC_KEY).digest(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(data) {
  const [ivHex, encrypted] = data.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.createHash('sha256').update(ENC_KEY).digest(), Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

router.use(requireAuth);

// ── CRUD email accounts ──────────────────────────────────────────────────────

router.get('/accounts', async (req, res) => {
  const result = await pool.query(
    'SELECT id, label, email_address, imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls, pop3_host, pop3_port, pop3_tls, username, protocol, created_at FROM email_accounts WHERE user_id = $1 ORDER BY created_at',
    [req.user.id]
  );
  res.json(result.rows);
});

router.post('/accounts', async (req, res) => {
  try {
    const { label, email_address, imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls, pop3_host, pop3_port, pop3_tls, username, password, protocol } = req.body;
    if (!label || !email_address || !username || !password) {
      return res.status(400).json({ error: 'Label, email, username, and password are required' });
    }
    const proto = protocol || 'imap';
    if (proto === 'imap' && !imap_host) return res.status(400).json({ error: 'IMAP host required' });
    if (proto === 'pop3' && !pop3_host) return res.status(400).json({ error: 'POP3 host required' });
    if (!smtp_host) return res.status(400).json({ error: 'SMTP host required for sending' });

    const existing = await pool.query('SELECT COUNT(*) FROM email_accounts WHERE user_id = $1', [req.user.id]);
    if (parseInt(existing.rows[0].count) >= 5) {
      return res.status(400).json({ error: 'Maximum 5 email accounts' });
    }

    const password_enc = encrypt(password);
    const result = await pool.query(
      `INSERT INTO email_accounts (user_id, label, email_address, imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls, pop3_host, pop3_port, pop3_tls, username, password_enc, protocol)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, label, email_address, imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls, pop3_host, pop3_port, pop3_tls, username, protocol, created_at`,
      [req.user.id, label, email_address, imap_host || null, imap_port || 993, imap_tls !== false, smtp_host || null, smtp_port || 587, smtp_tls !== false, pop3_host || null, pop3_port || 995, pop3_tls !== false, username, password_enc, proto]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Add email account error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/accounts/:id', async (req, res) => {
  await pool.query('DELETE FROM email_accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ── Test connection ──────────────────────────────────────────────────────────

router.post('/accounts/:id/test', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);
    const results = {};

    if (acct.protocol === 'imap' && acct.imap_host) {
      try {
        const client = new ImapFlow({
          host: acct.imap_host, port: acct.imap_port,
          secure: acct.imap_tls, auth: { user: acct.username, pass: password },
          logger: false
        });
        await client.connect();
        await client.logout();
        results.imap = 'ok';
      } catch (e) { results.imap = e.message; }
    }

    if (acct.smtp_host) {
      try {
        const transport = nodemailer.createTransport({
          host: acct.smtp_host, port: acct.smtp_port,
          secure: acct.smtp_port === 465,
          auth: { user: acct.username, pass: password },
          tls: { rejectUnauthorized: false }
        });
        await transport.verify();
        results.smtp = 'ok';
      } catch (e) { results.smtp = e.message; }
    }

    if (acct.protocol === 'pop3' && acct.pop3_host) {
      try {
        await testPop3(acct.pop3_host, acct.pop3_port, acct.pop3_tls, acct.username, password);
        results.pop3 = 'ok';
      } catch (e) { results.pop3 = e.message; }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── List mailboxes (IMAP) ────────────────────────────────────────────────────

router.get('/accounts/:id/mailboxes', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);

    const client = new ImapFlow({
      host: acct.imap_host, port: acct.imap_port,
      secure: acct.imap_tls, auth: { user: acct.username, pass: password },
      logger: false
    });
    await client.connect();
    const boxes = await client.list();
    await client.logout();

    res.json(boxes.map(b => ({
      path: b.path, name: b.name, delimiter: b.delimiter,
      flags: b.flags ? [...b.flags] : [],
      specialUse: b.specialUse || null,
      listed: b.listed
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── List messages ────────────────────────────────────────────────────────────

router.get('/accounts/:id/messages', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);
    const folder = req.query.folder || 'INBOX';
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 50);

    if (acct.protocol === 'pop3') {
      return await listPop3(acct, password, limit, res);
    }

    const client = new ImapFlow({
      host: acct.imap_host, port: acct.imap_port,
      secure: acct.imap_tls, auth: { user: acct.username, pass: password },
      logger: false
    });
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const status = client.mailbox;
      const total = status.exists || 0;
      const start = Math.max(1, total - (page * limit) + 1);
      const end = Math.max(1, total - ((page - 1) * limit));

      if (total === 0) {
        res.json({ messages: [], total, page, pages: 0 });
        return;
      }

      const messages = [];
      const range = `${start}:${end}`;
      for await (const msg of client.fetch(range, { envelope: true, flags: true, uid: true, size: true })) {
        messages.push({
          uid: msg.uid, seq: msg.seq,
          subject: msg.envelope.subject || '(no subject)',
          from: msg.envelope.from || [],
          to: msg.envelope.to || [],
          date: msg.envelope.date,
          flags: msg.flags ? [...msg.flags] : [],
          size: msg.size || 0
        });
      }

      messages.sort((a, b) => new Date(b.date) - new Date(a.date));
      res.json({ messages, total, page, pages: Math.ceil(total / limit) });
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Read a message ───────────────────────────────────────────────────────────

router.get('/accounts/:id/messages/:uid', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid);

    if (acct.protocol === 'pop3') {
      return await readPop3Message(acct, password, uid, res);
    }

    const client = new ImapFlow({
      host: acct.imap_host, port: acct.imap_port,
      secure: acct.imap_tls, auth: { user: acct.username, pass: password },
      logger: false
    });
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const raw = await client.download(uid.toString(), undefined, { uid: true });
      if (!raw || !raw.content) {
        return res.status(404).json({ error: 'Message not found' });
      }
      const chunks = [];
      for await (const chunk of raw.content) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const parsed = await simpleParser(buf);

      await client.messageFlagsAdd(uid.toString(), ['\\Seen'], { uid: true });

      res.json({
        uid,
        subject: parsed.subject || '(no subject)',
        from: parsed.from ? parsed.from.value : [],
        to: parsed.to ? parsed.to.value : [],
        cc: parsed.cc ? parsed.cc.value : [],
        date: parsed.date,
        html: parsed.html || null,
        text: parsed.text || null,
        attachments: (parsed.attachments || []).map(a => ({
          filename: a.filename, contentType: a.contentType, size: a.size,
          contentId: a.contentId || null
        }))
      });
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Send message (SMTP) ─────────────────────────────────────────────────────

router.post('/accounts/:id/send', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);
    const { to, cc, bcc, subject, text, html, inReplyTo, references } = req.body;

    if (!to) return res.status(400).json({ error: 'Recipient required' });

    const transport = nodemailer.createTransport({
      host: acct.smtp_host, port: acct.smtp_port,
      secure: acct.smtp_port === 465,
      auth: { user: acct.username, pass: password },
      tls: { rejectUnauthorized: false }
    });

    const mailOpts = {
      from: acct.email_address,
      to, cc: cc || undefined, bcc: bcc || undefined,
      subject: subject || '',
      text: text || undefined,
      html: html || undefined,
      inReplyTo: inReplyTo || undefined,
      references: references || undefined
    };

    const info = await transport.sendMail(mailOpts);

    // Copy to Sent folder via IMAP if available
    if (acct.imap_host) {
      try {
        const client = new ImapFlow({
          host: acct.imap_host, port: acct.imap_port,
          secure: acct.imap_tls, auth: { user: acct.username, pass: password },
          logger: false
        });
        await client.connect();
        const boxes = await client.list();
        const sentBox = boxes.find(b => b.specialUse === '\\Sent') || boxes.find(b => /sent/i.test(b.name));
        if (sentBox) {
          const raw = await transport.sendMail({ ...mailOpts, envelope: false });
          // Build raw message for appending
          const rawMsg = `From: ${acct.email_address}\r\nTo: ${to}\r\nSubject: ${subject || ''}\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text || ''}`;
          await client.append(sentBox.path, rawMsg, ['\\Seen']);
        }
        await client.logout();
      } catch (_) { /* best-effort copy to Sent */ }
    }

    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete message ───────────────────────────────────────────────────────────

router.delete('/accounts/:id/messages/:uid', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid);

    const client = new ImapFlow({
      host: acct.imap_host, port: acct.imap_port,
      secure: acct.imap_tls, auth: { user: acct.username, pass: password },
      logger: false
    });
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageDelete(uid.toString(), { uid: true });
    } finally {
      lock.release();
      await client.logout();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Move message ─────────────────────────────────────────────────────────────

router.post('/accounts/:id/messages/:uid/move', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid);
    const { destination } = req.body;
    if (!destination) return res.status(400).json({ error: 'Destination folder required' });

    const client = new ImapFlow({
      host: acct.imap_host, port: acct.imap_port,
      secure: acct.imap_tls, auth: { user: acct.username, pass: password },
      logger: false
    });
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageMove(uid.toString(), destination, { uid: true });
    } finally {
      lock.release();
      await client.logout();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Toggle flag ──────────────────────────────────────────────────────────────

router.post('/accounts/:id/messages/:uid/flag', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid);
    const { flag, add } = req.body;

    const client = new ImapFlow({
      host: acct.imap_host, port: acct.imap_port,
      secure: acct.imap_tls, auth: { user: acct.username, pass: password },
      logger: false
    });
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      if (add) {
        await client.messageFlagsAdd(uid.toString(), [flag], { uid: true });
      } else {
        await client.messageFlagsRemove(uid.toString(), [flag], { uid: true });
      }
    } finally {
      lock.release();
      await client.logout();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Download attachment ──────────────────────────────────────────────────────

router.get('/accounts/:id/messages/:uid/attachment/:index', async (req, res) => {
  try {
    const acct = await getAccount(req.params.id, req.user.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const password = decrypt(acct.password_enc);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid);
    const attachIndex = parseInt(req.params.index);

    const client = new ImapFlow({
      host: acct.imap_host, port: acct.imap_port,
      secure: acct.imap_tls, auth: { user: acct.username, pass: password },
      logger: false
    });
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const raw = await client.download(uid.toString(), undefined, { uid: true });
      const chunks = [];
      for await (const chunk of raw.content) chunks.push(chunk);
      const parsed = await simpleParser(Buffer.concat(chunks));
      const att = (parsed.attachments || [])[attachIndex];
      if (!att) return res.status(404).json({ error: 'Attachment not found' });
      res.setHeader('Content-Type', att.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${att.filename || 'attachment'}"`);
      res.send(att.content);
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POP3 helpers ─────────────────────────────────────────────────────────────

function pop3Command(socket, cmd) {
  return new Promise((resolve, reject) => {
    let data = '';
    const onData = chunk => {
      data += chunk.toString();
      if (data.includes('\r\n')) {
        socket.removeListener('data', onData);
        if (data.startsWith('+OK')) resolve(data.trim());
        else reject(new Error(data.trim()));
      }
    };
    socket.on('data', onData);
    socket.write(cmd + '\r\n');
  });
}

function pop3MultiLine(socket, cmd) {
  return new Promise((resolve, reject) => {
    let data = '';
    const onData = chunk => {
      data += chunk.toString();
      if (data.includes('\r\n.\r\n')) {
        socket.removeListener('data', onData);
        if (data.startsWith('+OK')) resolve(data);
        else reject(new Error(data.trim()));
      }
    };
    socket.on('data', onData);
    socket.write(cmd + '\r\n');
  });
}

async function connectPop3(host, port, tls, username, password) {
  return new Promise((resolve, reject) => {
    const opts = { host, port };
    const createConn = tls
      ? () => require('tls').connect(opts, () => {})
      : () => net.createConnection(opts);
    const socket = createConn();
    socket.setEncoding('utf8');
    let greeting = '';
    const onGreeting = chunk => {
      greeting += chunk;
      if (greeting.includes('\r\n')) {
        socket.removeListener('data', onGreeting);
        if (!greeting.startsWith('+OK')) return reject(new Error(greeting));
        (async () => {
          await pop3Command(socket, `USER ${username}`);
          await pop3Command(socket, `PASS ${password}`);
          resolve(socket);
        })().catch(reject);
      }
    };
    socket.on('data', onGreeting);
    socket.on('error', reject);
    setTimeout(() => reject(new Error('POP3 connection timeout')), 15000);
  });
}

async function testPop3(host, port, tls, username, password) {
  const socket = await connectPop3(host, port, tls, username, password);
  await pop3Command(socket, 'QUIT');
  socket.destroy();
}

async function listPop3(acct, password, limit, res) {
  const socket = await connectPop3(acct.pop3_host, acct.pop3_port, acct.pop3_tls, acct.username, password);
  const statResp = await pop3Command(socket, 'STAT');
  const total = parseInt(statResp.split(' ')[1]) || 0;

  const messages = [];
  const start = Math.max(1, total - limit + 1);
  for (let i = total; i >= start && i >= 1; i--) {
    try {
      const topResp = await pop3MultiLine(socket, `TOP ${i} 0`);
      const headerLines = topResp.split('\r\n').slice(1);
      const headers = {};
      let lastKey = '';
      for (const line of headerLines) {
        if (line === '.') break;
        if (/^\s/.test(line) && lastKey) { headers[lastKey] += ' ' + line.trim(); }
        else { const [k, ...v] = line.split(':'); if (k && v.length) { lastKey = k.toLowerCase(); headers[lastKey] = v.join(':').trim(); } }
      }
      messages.push({
        uid: i, seq: i,
        subject: headers.subject || '(no subject)',
        from: headers.from ? [{ address: headers.from, name: '' }] : [],
        to: headers.to ? [{ address: headers.to, name: '' }] : [],
        date: headers.date || null,
        flags: [], size: 0
      });
    } catch (_) { /* skip unreadable */ }
  }

  await pop3Command(socket, 'QUIT').catch(() => {});
  socket.destroy();
  res.json({ messages, total, page: 1, pages: Math.ceil(total / limit) });
}

async function readPop3Message(acct, password, msgNum, res) {
  const socket = await connectPop3(acct.pop3_host, acct.pop3_port, acct.pop3_tls, acct.username, password);
  const retrResp = await pop3MultiLine(socket, `RETR ${msgNum}`);
  await pop3Command(socket, 'QUIT').catch(() => {});
  socket.destroy();

  const rawLines = retrResp.split('\r\n');
  rawLines.shift(); // remove +OK line
  const idx = rawLines.indexOf('.');
  if (idx !== -1) rawLines.splice(idx);
  const raw = rawLines.join('\r\n');
  const parsed = await simpleParser(raw);

  res.json({
    uid: msgNum,
    subject: parsed.subject || '(no subject)',
    from: parsed.from ? parsed.from.value : [],
    to: parsed.to ? parsed.to.value : [],
    cc: parsed.cc ? parsed.cc.value : [],
    date: parsed.date,
    html: parsed.html || null,
    text: parsed.text || null,
    attachments: (parsed.attachments || []).map(a => ({
      filename: a.filename, contentType: a.contentType, size: a.size
    }))
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAccount(id, userId) {
  const r = await pool.query('SELECT * FROM email_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}

module.exports = router;
