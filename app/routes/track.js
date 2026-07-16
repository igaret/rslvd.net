const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const activity = require('../lib/activity');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  validate: { xForwardedForHeader: false, ip: false, trustProxy: false, default: false },
  keyGenerator: (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip,
});

// Resolves the user id from a Bearer token if present; anonymous otherwise.
function userIdFrom(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET).userId || null;
  } catch {
    return null;
  }
}

// POST /api/track/pageview { path }
router.post('/pageview', limiter, (req, res) => {
  const path = typeof req.body?.path === 'string' ? req.body.path : '';
  if (!path.startsWith('/') || path.length > 200 || path.includes('\n')) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  activity.log('page.view', { userId: userIdFrom(req), detail: path, req });
  res.status(204).end();
});

module.exports = router;
