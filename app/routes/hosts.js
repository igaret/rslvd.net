const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const ionos = require('../lib/ionos');
const activity = require('../lib/activity');
const ssl = require('../lib/ssl');

const PLAN_LIMITS = {
  free: 2,
  none: 0,
  monthly: 4,
  quarterly: 12,
  semi_annual: 24,
  annual: 999999,
};

router.use(requireAuth);

// List user's hosts
router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT id, hostname, fqdn, ip_address, ipv6_address, last_updated, update_key, active, created_at, parent_host_id FROM hosts WHERE user_id = $1 ORDER BY parent_host_id NULLS FIRST, created_at DESC',
    [req.user.id]
  );
  res.json(result.rows);
});

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const CAN_NEST = (user) => user.plan === 'annual' || user.is_site_owner;

// Create a host
router.post('/', async (req, res) => {
  try {
    const { hostname, parent_id } = req.body;
    if (!hostname) return res.status(400).json({ error: 'Hostname required' });

    const user = req.user;
    const BASE = process.env.BASE_DOMAIN;

    // ── Nested subdomain path ───────────────────────────────────────────────
    if (parent_id) {
      if (!CAN_NEST(user)) {
        return res.status(403).json({ error: 'Nested subdomains require an Annual plan.' });
      }

      // Validate the sub-label (single label only, no dots)
      if (!LABEL_RE.test(hostname)) {
        return res.status(400).json({ error: 'Invalid label. Use lowercase letters, numbers, and hyphens only.' });
      }

      // Verify parent belongs to this user
      const parentResult = await pool.query(
        'SELECT id, fqdn, hostname FROM hosts WHERE id = $1 AND user_id = $2 AND active = TRUE',
        [parent_id, user.id]
      );
      const parent = parentResult.rows[0];
      if (!parent) return res.status(404).json({ error: 'Parent host not found or not yours.' });

      // Only allow 1 level deep (parent must itself be a top-level host)
      const parentNested = await pool.query('SELECT id FROM hosts WHERE id = $1 AND parent_host_id IS NOT NULL', [parent_id]);
      if (parentNested.rows[0]) {
        return res.status(400).json({ error: 'Cannot nest more than 1 level deep.' });
      }

      const fqdn = `${hostname}.${parent.fqdn}`;

      // Check availability
      const existing = await pool.query('SELECT id FROM hosts WHERE fqdn = $1', [fqdn]);
      if (existing.rows[0]) return res.status(409).json({ error: 'That subdomain is already taken.' });

      // Count against the same host limit
      if (user.plan !== 'free' && user.plan_expires_at && new Date(user.plan_expires_at) < new Date()) {
        return res.status(403).json({ error: 'Subscription expired' });
      }
      const countResult = await pool.query('SELECT COUNT(*) FROM hosts WHERE user_id = $1 AND active = TRUE', [user.id]);
      const limit = user.max_hosts || PLAN_LIMITS[user.plan] || 0;
      if (parseInt(countResult.rows[0].count) >= limit) {
        return res.status(403).json({ error: `Host limit reached (${limit}). Upgrade to add more.` });
      }

      const updateKey = crypto.randomBytes(24).toString('hex');
      const result = await pool.query(
        `INSERT INTO hosts (user_id, hostname, fqdn, update_key, parent_host_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, hostname, fqdn, ip_address, ipv6_address, last_updated, update_key, active, created_at, parent_host_id`,
        [user.id, hostname, fqdn, updateKey, parent_id]
      );

      // Provision SSL cert for nested subdomain (async, non-blocking)
      ssl.provisionCert(fqdn).catch(e => console.error('SSL provision failed:', e.message));

      activity.log('host.create', { userId: user.id, detail: fqdn, req });
      return res.status(201).json({ ...result.rows[0], parent_fqdn: parent.fqdn });
    }

    // ── Top-level subdomain path ────────────────────────────────────────────
    if (!LABEL_RE.test(hostname)) {
      return res.status(400).json({ error: 'Invalid hostname. Use lowercase letters, numbers, and hyphens only.' });
    }

    // Check subscription limit
    const limit = user.max_hosts || PLAN_LIMITS[user.plan] || 0;
    if (limit === 0) return res.status(403).json({ error: 'Upgrade your plan to create more hosts' });

    // Check paid plan expiry (free tier never expires)
    if (user.plan !== 'free' && user.plan_expires_at && new Date(user.plan_expires_at) < new Date()) {
      return res.status(403).json({ error: 'Subscription expired' });
    }

    const countResult = await pool.query('SELECT COUNT(*) FROM hosts WHERE user_id = $1 AND active = TRUE', [user.id]);
    if (parseInt(countResult.rows[0].count) >= limit) {
      return res.status(403).json({ error: `Host limit reached (${limit} for your plan). Upgrade to add more.` });
    }

    // Block reserved subdomains (site_owner may bypass)
    if (!user.is_site_owner) {
      const reserved = await pool.query('SELECT subdomain FROM reserved_subdomains WHERE subdomain = $1', [hostname]);
      if (reserved.rows[0]) return res.status(409).json({ error: `"${hostname}" is a reserved subdomain and cannot be registered.` });
    }

    const fqdn = `${hostname}.${BASE}`;
    const existing = await pool.query('SELECT id FROM hosts WHERE fqdn = $1', [fqdn]);
    if (existing.rows[0]) return res.status(409).json({ error: 'Hostname already taken' });

    const updateKey = crypto.randomBytes(24).toString('hex');

    const result = await pool.query(
      `INSERT INTO hosts (user_id, hostname, fqdn, update_key) VALUES ($1, $2, $3, $4)
       RETURNING id, hostname, fqdn, ip_address, ipv6_address, last_updated, update_key, active, created_at`,
      [user.id, hostname, fqdn, updateKey]
    );

    activity.log('host.create', { userId: user.id, detail: fqdn, req });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create host' });
  }
});

// Delete a host
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hosts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const host = result.rows[0];
    if (!host) return res.status(404).json({ error: 'Host not found' });

    // Remove DNS records
    try {
      if (host.ionos_record_id_v4) await ionos.removeRecord(host.ionos_record_id_v4);
      if (host.ionos_record_id_v6) await ionos.removeRecord(host.ionos_record_id_v6);
    } catch (e) {
      console.error('IONOS delete error:', e.message);
    }

    // Remove SSL cert config for nested subdomains
    if (ssl.isNestedSubdomain(host.fqdn)) {
      ssl.removeCertConfig(host.fqdn);
    }

    await pool.query('DELETE FROM hosts WHERE id = $1', [req.params.id]);
    activity.log('host.delete', { userId: req.user.id, detail: host.fqdn, req });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete host' });
  }
});

// Regenerate update key
router.post('/:id/regenerate-key', async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM hosts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Host not found' });

    const newKey = crypto.randomBytes(24).toString('hex');
    const updated = await pool.query(
      'UPDATE hosts SET update_key = $1 WHERE id = $2 RETURNING update_key',
      [newKey, req.params.id]
    );
    res.json({ update_key: updated.rows[0].update_key });
  } catch (err) {
    res.status(500).json({ error: 'Failed to regenerate key' });
  }
});

module.exports = router;
