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
  pushToNtfy(event, detail).catch((e) => console.error('activity ntfy error:', e.message));
}

// Mirror activity events to the admin's ntfy feed at default priority.
// Push-only: no email fallback, so routine site activity never spams the inbox.
async function pushToNtfy(event, detail) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  const headers = { Title: `rslvd activity: ${event}`, Priority: 'default', Tags: 'page_facing_up' };
  if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
  await fetch(`${server}/${topic}`, { method: 'POST', headers, body: detail || event });
}

module.exports = { log };
