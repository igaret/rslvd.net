const router = require('express').Router();
const pool = require('../db/pool');
const { requireAdmin, requireSiteOwner } = require('../middleware/auth');

// All admin routes require at least admin role (site_owner also passes)
router.use(requireAdmin);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [users, hosts, tunnels, active, byPlan, recentUsers] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM hosts'),
      pool.query('SELECT COUNT(*) FROM tunnels WHERE active = TRUE'),
      pool.query("SELECT COUNT(*) FROM users WHERE subscription_status = 'active'"),
      pool.query("SELECT plan, COUNT(*) FROM users GROUP BY plan ORDER BY COUNT(*) DESC"),
      pool.query("SELECT id, email, plan, subscription_status, created_at FROM users ORDER BY created_at DESC LIMIT 5"),
    ]);
    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalHosts: parseInt(hosts.rows[0].count),
      totalTunnels: parseInt(tunnels.rows[0].count),
      activeSubscribers: parseInt(active.rows[0].count),
      byPlan: byPlan.rows,
      recentUsers: recentUsers.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, plan, subscription_status, max_hosts, max_tunnels,
              is_admin, is_site_owner, plan_expires_at, created_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const [user, hosts, tunnels] = await Promise.all([
      pool.query('SELECT id, email, plan, subscription_status, max_hosts, max_tunnels, is_admin, is_site_owner, plan_expires_at, created_at FROM users WHERE id = $1', [req.params.id]),
      pool.query('SELECT id, fqdn, ip_address, last_updated, active FROM hosts WHERE user_id = $1', [req.params.id]),
      pool.query('SELECT id, name, fqdn, tunnel_port, status, active, created_at FROM tunnels WHERE user_id = $1', [req.params.id]),
    ]);
    if (!user.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ...user.rows[0], hosts: hosts.rows, tunnels: tunnels.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const isSiteOwner = req.user.is_site_owner;
    const { plan, maxHosts, maxTunnels, subscriptionStatus, isAdmin, isSiteOwnerFlag } = req.body;
    const fields = [];
    const vals = [];
    let i = 1;
    if (plan !== undefined) { fields.push(`plan = $${i++}`); vals.push(plan); }
    if (maxHosts !== undefined) { fields.push(`max_hosts = $${i++}`); vals.push(maxHosts); }
    if (maxTunnels !== undefined) { fields.push(`max_tunnels = $${i++}`); vals.push(maxTunnels); }
    if (subscriptionStatus !== undefined) { fields.push(`subscription_status = $${i++}`); vals.push(subscriptionStatus); }
    // Only site_owner can grant/revoke admin or site_owner
    if (isAdmin !== undefined && isSiteOwner) { fields.push(`is_admin = $${i++}`); vals.push(isAdmin); }
    if (isSiteOwnerFlag !== undefined && isSiteOwner) { fields.push(`is_site_owner = $${i++}`); vals.push(isSiteOwnerFlag); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`, vals);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/users/:id', requireSiteOwner, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ── Hosts ─────────────────────────────────────────────────────────────────────
router.get('/hosts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.id, h.fqdn, h.ip_address, h.last_updated, h.active, h.created_at, u.email
       FROM hosts h JOIN users u ON h.user_id = u.id
       ORDER BY h.created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
});

// ── Tunnels ───────────────────────────────────────────────────────────────────
router.get('/tunnels', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.fqdn, t.tunnel_port, t.target_port, t.status, t.active, t.created_at, u.email
       FROM tunnels t JOIN users u ON t.user_id = u.id
       ORDER BY t.created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tunnels' });
  }
});

// ── Activity Log ──────────────────────────────────────────────────────────────
router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const event = req.query.event || null;
    const result = await pool.query(
      `SELECT a.id, a.event, a.detail, a.ip_address, a.user_agent, a.created_at, u.email
       FROM activity_logs a LEFT JOIN users u ON a.user_id = u.id
       ${event ? 'WHERE a.event = $2' : ''}
       ORDER BY a.created_at DESC LIMIT $1`,
      event ? [limit, event] : [limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ── Reserved Subdomains (site_owner only) ─────────────────────────────────────
router.get('/reserved', requireSiteOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.subdomain, r.reason, r.created_at, u.email AS created_by_email
       FROM reserved_subdomains r LEFT JOIN users u ON r.created_by = u.id
       ORDER BY r.subdomain ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reserved subdomains' });
  }
});

router.post('/reserved', requireSiteOwner, async (req, res) => {
  try {
    const { subdomain, reason } = req.body;
    if (!subdomain) return res.status(400).json({ error: 'subdomain required' });
    const clean = subdomain.toLowerCase().trim();
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(clean)) {
      return res.status(400).json({ error: 'Invalid subdomain format' });
    }
    const result = await pool.query(
      `INSERT INTO reserved_subdomains (subdomain, reason, created_by)
       VALUES ($1, $2, $3) RETURNING id, subdomain, reason, created_at`,
      [clean, reason || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Already reserved' });
    res.status(500).json({ error: 'Failed to reserve subdomain' });
  }
});

router.delete('/reserved/:id', requireSiteOwner, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM reserved_subdomains WHERE id = $1 RETURNING subdomain', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, removed: result.rows[0].subdomain });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove reserved subdomain' });
  }
});

router.patch('/reserved/:id', requireSiteOwner, async (req, res) => {
  try {
    const { reason } = req.body;
    await pool.query('UPDATE reserved_subdomains SET reason = $1 WHERE id = $2', [reason, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// ── Server config (site_owner only) ──────────────────────────────────────────
router.get('/config', requireSiteOwner, async (req, res) => {
  res.json({
    base_domain: process.env.BASE_DOMAIN,
    app_url: process.env.APP_URL,
    server_ip: process.env.SERVER_IP || '13.220.239.207',
    node_env: process.env.NODE_ENV,
    stripe_configured: !!process.env.STRIPE_SECRET_KEY,
    ionos_configured: !!process.env.IONOS_API_KEY,
  });
});

module.exports = router;
