const pool = require('../db/pool');

async function log(event, { userId = null, detail = null, req = null } = {}) {
  try {
    const ip = req
      ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null)
      : null;
    const ua = req ? (req.headers['user-agent'] || null) : null;
    await pool.query(
      `INSERT INTO activity_logs (user_id, event, detail, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, event, detail || null, ip, ua]
    );
  } catch (e) {
    // Never crash the request over a log failure
    console.error('activity log error:', e.message);
  }
}

module.exports = { log };
