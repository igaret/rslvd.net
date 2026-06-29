const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const ionos = require('../lib/ionos');
const tunnelCert = require('../lib/tunnel-cert');
const activity = require('../lib/activity');
const gateway = require('../lib/braintree');

// ── Delete account ──────────────────────────────────────────────────────────
// Permanently deletes the user, cancels any active subscription, and removes
// all of their hosts/tunnels (DNS records, SSL certs, HTTP fallback configs).
router.post('/delete', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required to delete your account' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    // Site owners cannot self-delete (avoid orphaning the platform)
    if (user.is_site_owner) {
      return res.status(403).json({ error: 'Site owner accounts cannot be deleted from here.' });
    }

    // Cancel any active subscription (best-effort)
    if (gateway && user.subscription_id) {
      try {
        await gateway.subscription.cancel(user.subscription_id);
      } catch (e) {
        if (!e.message || !e.message.includes('has already been canceled')) {
          console.error('Account delete: subscription cancel failed:', e.message);
        }
      }
    }

    // Tear down hosts (DNS records, certs, HTTP fallback)
    const hosts = await pool.query(
      'SELECT fqdn, ionos_record_id_v4, ionos_record_id_v6 FROM hosts WHERE user_id = $1',
      [user.id]
    );
    for (const h of hosts.rows) {
      try {
        if (h.ionos_record_id_v4) await ionos.removeRecord(h.ionos_record_id_v4);
        if (h.ionos_record_id_v6) await ionos.removeRecord(h.ionos_record_id_v6);
      } catch (e) { console.error('Account delete: IONOS host cleanup failed:', e.message); }
      tunnelCert.deprovisionCert(h.fqdn);
      tunnelCert.disableHttpFallback(h.fqdn);
    }

    // Tear down tunnels (DNS records, certs, HTTP fallback)
    const tunnels = await pool.query(
      'SELECT fqdn, ionos_record_id FROM tunnels WHERE user_id = $1',
      [user.id]
    );
    for (const t of tunnels.rows) {
      try {
        if (t.ionos_record_id) await ionos.removeRecord(t.ionos_record_id);
      } catch (e) { console.error('Account delete: IONOS tunnel cleanup failed:', e.message); }
      tunnelCert.deprovisionCert(t.fqdn);
      tunnelCert.disableHttpFallback(t.fqdn);
    }

    // Log before deleting (activity_logs.user_id is ON DELETE SET NULL)
    activity.log('user.account_deleted', { userId: user.id, detail: user.email, req });

    // Delete the user — hosts/tunnels and other CASCADE rows go with it
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
