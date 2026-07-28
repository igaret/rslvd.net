const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');
const { notifyAdmin } = require('../lib/notify');

// Closed beta signup for the Android app Play Store submission.
const BETA_MAX_TESTERS = parseInt(process.env.BETA_MAX_TESTERS || '12', 10);

const limiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  validate: { xForwardedForHeader: false, ip: false, trustProxy: false, default: false },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/status', async (req, res) => {
  try {
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM beta_testers');
    res.json({ max: BETA_MAX_TESTERS, taken: count, remaining: Math.max(0, BETA_MAX_TESTERS - count) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/signup', limiter, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const name = (req.body.name || '').trim().slice(0, 100);
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM beta_testers');
    if (count >= BETA_MAX_TESTERS) {
      return res.status(409).json({ error: 'All beta spots are taken — thanks for your interest!' });
    }

    const { rows: [row] } = await pool.query(
      `INSERT INTO beta_testers (email, name) VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING RETURNING *`,
      [email, name || null]
    );
    if (!row) return res.status(409).json({ error: 'This email is already signed up' });

    notifyAdmin(
      `Beta tester #${count + 1}/${BETA_MAX_TESTERS}: ${email}`,
      `${name || 'No name given'} signed up for the Android app beta.`
    ).catch(e => console.error('[beta] notify failed:', e.message));

    res.status(201).json({ success: true, spot: count + 1, max: BETA_MAX_TESTERS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
