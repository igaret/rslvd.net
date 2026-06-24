const router = require('express').Router();
const pool = require('../db/pool');
const nodemailer = require('nodemailer');
const { requireAuth } = require('../middleware/auth');

const MAX_MESSAGES = 3;
const RESERVED = ['admin', 'postmaster', 'abuse', 'noreply', 'no-reply', 'support', 'info', 'help', 'root', 'webmaster', 'mailer-daemon', 'hostmaster', 'security', 'www', 'mail', 'ftp', 'smtp', 'imap', 'pop', 'dns', 'ns1', 'ns2'];

// Check availability (no auth — used during registration)
router.get('/check/:localPart', async (req, res) => {
  try {
    const lp = req.params.localPart.toLowerCase().trim();
    if (RESERVED.includes(lp)) return res.json({ available: false, reason: 'That name is reserved' });
    if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(lp) || lp.length > 64) {
      return res.json({ available: false, reason: 'Invalid format' });
    }
    const r = await pool.query('SELECT id FROM parked_emails WHERE local_part = $1', [lp]);
    res.json({ available: r.rows.length === 0, reason: r.rows.length > 0 ? `${lp}@rslvd.net is already taken` : undefined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All remaining routes require auth
router.use(requireAuth);

async function getUserEmail(userId) {
  const r = await pool.query('SELECT id, local_part FROM parked_emails WHERE user_id = $1', [userId]);
  return r.rows[0] || null;
}

router.get('/info', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, local_part, created_at FROM parked_emails WHERE user_id = $1',
      [req.user.id]
    );
    if (r.rows.length === 0) return res.json(null);
    const pe = r.rows[0];
    const cnt = await pool.query(
      'SELECT COUNT(*) FROM parked_messages WHERE parked_email_id = $1 AND is_trashed = FALSE',
      [pe.id]
    );
    const unread = await pool.query(
      'SELECT COUNT(*) FROM parked_messages WHERE parked_email_id = $1 AND is_read = FALSE AND is_trashed = FALSE',
      [pe.id]
    );
    res.json({
      id: pe.id,
      address: `${pe.local_part}@rslvd.net`,
      localPart: pe.local_part,
      messageCount: parseInt(cnt.rows[0].count),
      unreadCount: parseInt(unread.rows[0].count),
      createdAt: pe.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const pe = await getUserEmail(req.user.id);
    if (!pe) return res.status(404).json({ error: 'No parked email' });
    const folder = req.query.folder || 'inbox';
    const isTrashed = folder === 'trash';
    const result = await pool.query(
      `SELECT id, from_address, from_name, to_address, subject, is_read, is_outbound, received_at
       FROM parked_messages WHERE parked_email_id = $1 AND is_trashed = $2
       ORDER BY received_at DESC`,
      [pe.id, isTrashed]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/:id', async (req, res) => {
  try {
    const pe = await getUserEmail(req.user.id);
    if (!pe) return res.status(404).json({ error: 'No parked email' });
    const result = await pool.query(
      'SELECT * FROM parked_messages WHERE id = $1 AND parked_email_id = $2',
      [req.params.id, pe.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    if (!result.rows[0].is_read) {
      await pool.query('UPDATE parked_messages SET is_read = TRUE WHERE id = $1', [req.params.id]);
    }
    const msg = result.rows[0];
    msg.is_read = true;
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/messages/:id/read', async (req, res) => {
  try {
    const pe = await getUserEmail(req.user.id);
    if (!pe) return res.status(404).json({ error: 'No parked email' });
    const { is_read } = req.body;
    await pool.query(
      'UPDATE parked_messages SET is_read = $1 WHERE id = $2 AND parked_email_id = $3',
      [is_read !== false, req.params.id, pe.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/messages/:id/trash', async (req, res) => {
  try {
    const pe = await getUserEmail(req.user.id);
    if (!pe) return res.status(404).json({ error: 'No parked email' });
    await pool.query(
      'UPDATE parked_messages SET is_trashed = TRUE WHERE id = $1 AND parked_email_id = $2',
      [req.params.id, pe.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/messages/:id/restore', async (req, res) => {
  try {
    const pe = await getUserEmail(req.user.id);
    if (!pe) return res.status(404).json({ error: 'No parked email' });
    await pool.query(
      'UPDATE parked_messages SET is_trashed = FALSE WHERE id = $1 AND parked_email_id = $2',
      [req.params.id, pe.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    const pe = await getUserEmail(req.user.id);
    if (!pe) return res.status(404).json({ error: 'No parked email' });
    await pool.query(
      'DELETE FROM parked_messages WHERE id = $1 AND parked_email_id = $2',
      [req.params.id, pe.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/trash', async (req, res) => {
  try {
    const pe = await getUserEmail(req.user.id);
    if (!pe) return res.status(404).json({ error: 'No parked email' });
    await pool.query(
      'DELETE FROM parked_messages WHERE parked_email_id = $1 AND is_trashed = TRUE',
      [pe.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const pe = await getUserEmail(req.user.id);
    if (!pe) return res.status(404).json({ error: 'No parked email' });
    const { to, subject, body } = req.body;
    if (!to) return res.status(400).json({ error: 'Recipient is required' });
    const fromAddr = `${pe.local_part}@rslvd.net`;
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: 25,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
    await transport.sendMail({
      from: `"${pe.local_part}" <${fromAddr}>`,
      to,
      subject: subject || '(no subject)',
      text: body || '',
    });
    const cnt = await pool.query(
      'SELECT COUNT(*) FROM parked_messages WHERE parked_email_id = $1 AND is_trashed = FALSE',
      [pe.id]
    );
    if (parseInt(cnt.rows[0].count) < MAX_MESSAGES) {
      await pool.query(
        `INSERT INTO parked_messages (parked_email_id, from_address, from_name, to_address, subject, text_body, is_read, is_outbound)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)`,
        [pe.id, fromAddr, pe.local_part, to, subject || '(no subject)', body || '']
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
