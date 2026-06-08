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

// ── Services Management (site_owner only) ───────────────────────────────────
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Services that can be managed
const MANAGED_SERVICES = [
  { name: 'rslvd', displayName: 'RSLVD App', description: 'Main Node.js application (includes tunnel proxy)', critical: true },
  { name: 'nginx', displayName: 'Nginx', description: 'Web server and reverse proxy', critical: true },
  { name: 'postgresql', displayName: 'PostgreSQL', description: 'Database server', critical: true },
  { name: 'postfix', displayName: 'Postfix', description: 'Mail transfer agent (noreply@rslvd.net)', critical: false },
  { name: 'opendkim', displayName: 'OpenDKIM', description: 'DKIM email signing service', critical: false },
//  { name: 'ufw', displayName: 'UFW Firewall', description: 'Uncomplicated Firewall', critical: false },
  { name: 'ssh', displayName: 'SSH', description: 'Secure Shell server', critical: true },
];

router.get('/services', requireSiteOwner, async (req, res) => {
  try {
    const services = await Promise.all(MANAGED_SERVICES.map(async (svc) => {
      try {
        const { stdout: statusOut } = await execPromise(`systemctl is-active ${svc.name}`);
        const { stdout: enabledOut } = await execPromise(`systemctl is-enabled ${svc.name} 2>/dev/null || echo "disabled"`);
        return {
          ...svc,
          status: statusOut.trim(),
          enabled: enabledOut.trim() === 'enabled',
          loading: false
        };
      } catch (e) {
        return {
          ...svc,
          status: 'inactive',
          enabled: false,
          loading: false
        };
      }
    }));
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

router.post('/services/:name/toggle', requireSiteOwner, async (req, res) => {
  const { name } = req.params;
  const { action } = req.body; // 'start', 'stop', 'restart', 'enable', 'disable'
  
  if (!MANAGED_SERVICES.find(s => s.name === name)) {
    return res.status(400).json({ error: 'Unknown service' });
  }
  
  const svc = MANAGED_SERVICES.find(s => s.name === name);
  if (svc.critical && action === 'stop') {
    return res.status(400).json({ error: 'Cannot stop critical service via web interface' });
  }
  
  try {
    let cmd;
    switch (action) {
      case 'start': cmd = `sudo systemctl start ${name}`; break;
      case 'stop': cmd = `sudo systemctl stop ${name}`; break;
      case 'restart': cmd = `sudo systemctl restart ${name}`; break;
      case 'enable': cmd = `sudo systemctl enable ${name}`; break;
      case 'disable': cmd = `sudo systemctl disable ${name}`; break;
      default: return res.status(400).json({ error: 'Invalid action' });
    }
    
    await execPromise(cmd);
    
    // Get updated status
    const { stdout: statusOut } = await execPromise(`systemctl is-active ${name}`);
    res.json({ success: true, status: statusOut.trim() });
  } catch (err) {
    res.status(500).json({ error: `Failed to ${action} service: ${err.message}` });
  }
});

// ── Configuration Management (site_owner only) ────────────────────────────────
const CONFIG_FILES = {
  nginx: {
    path: '/etc/nginx/sites-available/rslvd',
    backupPath: '/opt/rslvd/backups/nginx-rslvd.conf',
    description: 'Nginx site configuration',
    validateCmd: 'sudo nginx -t'
  },
  nginxMain: {
    path: '/etc/nginx/nginx.conf',
    backupPath: '/opt/rslvd/backups/nginx-main.conf',
    description: 'Main Nginx configuration',
    validateCmd: 'sudo nginx -t'
  },
  ufw: {
    path: '/etc/ufw/applications.d/rslvd',
    backupPath: '/opt/rslvd/backups/ufw-rslvd.conf',
    description: 'UFW application profile',
    validateCmd: 'sudo ufw status'
  },
  env: {
    path: '/opt/rslvd/.env',
    backupPath: '/opt/rslvd/backups/env-backup',
    description: 'Application environment variables',
    validateCmd: null,
    sensitive: true
  },
  systemd: {
    path: '/etc/systemd/system/rslvd.service',
    backupPath: '/opt/rslvd/backups/rslvd.service',
    description: 'RSLVD systemd service',
    validateCmd: 'sudo systemctl daemon-reload'
  }
};

router.get('/configs', requireSiteOwner, async (req, res) => {
  try {
    const configs = await Promise.all(Object.entries(CONFIG_FILES).map(async ([key, cfg]) => {
      try {
        const { stdout } = await execPromise(`sudo cat "${cfg.path}" 2>/dev/null || echo "# File not found"`);
        return {
          key,
          ...cfg,
          content: stdout,
          exists: stdout !== '# File not found'
        };
      } catch (e) {
        return {
          key,
          ...cfg,
          content: '# Error reading file',
          exists: false
        };
      }
    }));
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch configurations' });
  }
});

router.get('/config/:key', requireSiteOwner, async (req, res) => {
  const { key } = req.params;
  const cfg = CONFIG_FILES[key];
  if (!cfg) return res.status(404).json({ error: 'Config not found' });
  
  try {
    const { stdout } = await execPromise(`sudo cat "${cfg.path}" 2>/dev/null || echo ""`);
    res.json({ key, ...cfg, content: stdout });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

router.post('/config/:key', requireSiteOwner, async (req, res) => {
  const { key } = req.params;
  const { content, restart } = req.body;
  const cfg = CONFIG_FILES[key];
  if (!cfg) return res.status(404).json({ error: 'Config not found' });
  
  try {
    // Backup first
    await execPromise(`sudo mkdir -p /opt/rslvd/backups`);
    await execPromise(`sudo cp "${cfg.path}" "${cfg.backupPath}.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true`);
    
    // Write new content
    const escapedContent = content.replace(/'/g, "'\"'\"'");
    await execPromise(`echo '${escapedContent}' | sudo tee "${cfg.path}" > /dev/null`);
    
    // Validate if command exists
    if (cfg.validateCmd) {
      try {
        await execPromise(cfg.validateCmd);
      } catch (validateErr) {
        // Validation failed - restore backup
        const backups = await execPromise(`ls -t ${cfg.backupPath}.* 2>/dev/null | head -1`);
        if (backups.stdout.trim()) {
          await execPromise(`sudo cp "${backups.stdout.trim()}" "${cfg.path}"`);
        }
        return res.status(400).json({ error: 'Validation failed: ' + validateErr.message });
      }
    }
    
    // Restart service if requested and it's nginx
    if (restart && key.startsWith('nginx')) {
      await execPromise('sudo systemctl reload nginx');
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config: ' + err.message });
  }
});

// ── Database Editor (site_owner only, with safeguards) ──────────────────────
const SAFE_TABLES = ['users', 'hosts', 'tunnels', 'reserved_subdomains', 'activity_logs'];
const SENSITIVE_FIELDS = ['password_hash', 'stripe_customer_id', 'token'];

router.get('/db/tables', requireSiteOwner, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    res.json(result.rows.map(r => r.table_name).filter(t => SAFE_TABLES.includes(t)));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

router.get('/db/:table/schema', requireSiteOwner, async (req, res) => {
  const { table } = req.params;
  if (!SAFE_TABLES.includes(table)) {
    return res.status(403).json({ error: 'Table not accessible' });
  }
  
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [table]);
    
    const columns = result.rows.map(col => ({
      ...col,
      sensitive: SENSITIVE_FIELDS.includes(col.column_name)
    }));
    
    res.json(columns);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch schema' });
  }
});

router.get('/db/:table/rows', requireSiteOwner, async (req, res) => {
  const { table } = req.params;
  const { limit = 50, offset = 0, search } = req.query;
  
  if (!SAFE_TABLES.includes(table)) {
    return res.status(403).json({ error: 'Table not accessible' });
  }
  
  try {
    // Get column names, excluding sensitive ones
    const schemaResult = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [table]);
    
    const visibleColumns = schemaResult.rows
      .map(r => r.column_name)
      .filter(c => !SENSITIVE_FIELDS.includes(c));
    
    const columnsList = visibleColumns.join(', ');
    
    let query = `SELECT ${columnsList} FROM ${table}`;
    let params = [];
    
    if (search && visibleColumns.length > 0) {
      const searchCols = visibleColumns.filter(c => c.includes('email') || c.includes('name') || c.includes('fqdn'));
      if (searchCols.length > 0) {
        query += ` WHERE ${searchCols.map(c => `${c} ILIKE $1`).join(' OR ')}`;
        params.push(`%${search}%`);
      }
    }
    
    query += ` ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
    
    res.json({
      rows: result.rows,
      total: parseInt(countResult.rows[0].count),
      columns: visibleColumns
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rows: ' + err.message });
  }
});

router.patch('/db/:table/:id', requireSiteOwner, async (req, res) => {
  const { table, id } = req.params;
  const updates = req.body;
  
  if (!SAFE_TABLES.includes(table)) {
    return res.status(403).json({ error: 'Table not accessible' });
  }
  
  // Prevent updating sensitive fields
  const attemptedFields = Object.keys(updates);
  const blockedFields = attemptedFields.filter(f => SENSITIVE_FIELDS.includes(f));
  if (blockedFields.length > 0) {
    return res.status(403).json({ error: `Cannot modify sensitive fields: ${blockedFields.join(', ')}` });
  }
  
  try {
    const fields = [];
    const values = [];
    let i = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${i++}`);
      values.push(value);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    await pool.query(`UPDATE ${table} SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`, values);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

router.delete('/db/:table/:id', requireSiteOwner, async (req, res) => {
  const { table, id } = req.params;
  
  if (!SAFE_TABLES.includes(table)) {
    return res.status(403).json({ error: 'Table not accessible' });
  }
  
  // Extra safety - don't allow deleting from users table via this API
  if (table === 'users') {
    return res.status(403).json({ error: 'User deletion not allowed via DB editor. Use the users API.' });
  }
  
  try {
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
});

// ── Backup & Restore (site_owner only) ──────────────────────────────────────
const BACKUP_DIR = '/opt/rslvd/backups';

router.get('/backups', requireSiteOwner, async (req, res) => {
  try {
    await execPromise(`mkdir -p ${BACKUP_DIR}`);
    const { stdout } = await execPromise(`ls -lh ${BACKUP_DIR}/*.tar.gz 2>/dev/null | awk '{print $9, $5, $6, $7, $8}'`);
    
    const backups = stdout.trim().split('\n').filter(l => l).map(line => {
      const parts = line.split(' ');
      const filename = parts[0].split('/').pop();
      const size = parts[1];
      const date = parts.slice(2).join(' ');
      return { filename, size, date, path: parts[0] };
    });
    
    res.json(backups);
  } catch (err) {
    res.json([]);
  }
});

router.post('/backups/create', requireSiteOwner, async (req, res) => {
  const { type = 'full' } = req.body;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `rslvd-${type}-backup-${timestamp}.tar.gz`;
  const backupPath = `${BACKUP_DIR}/${backupName}`;
  
  try {
    await execPromise(`mkdir -p ${BACKUP_DIR}`);
    
    if (type === 'full') {
      // Full backup: app files, configs, database
      const tempDir = `/tmp/rslvd-backup-${timestamp}`;
      await execPromise(`mkdir -p ${tempDir}/{app,configs,db}`);
      
      // Copy app files
      await execPromise(`sudo cp -r /opt/rslvd/* ${tempDir}/app/ 2>/dev/null || true`);
      
      // Copy configs
      await execPromise(`sudo cp /etc/nginx/sites-available/rslvd ${tempDir}/configs/ 2>/dev/null || true`);
      await execPromise(`sudo cp /etc/systemd/system/rslvd.service ${tempDir}/configs/ 2>/dev/null || true`);
      await execPromise(`sudo cp /opt/rslvd/.env ${tempDir}/configs/ 2>/dev/null || true`);
      
      // Database dump
      await execPromise(`sudo -u postgres pg_dump rslvd > ${tempDir}/db/database.sql`);
      
      // Create archive
      await execPromise(`tar -czf ${backupPath} -C ${tempDir} .`);
      await execPromise(`rm -rf ${tempDir}`);
    } else if (type === 'database') {
      // Database only
      await execPromise(`sudo -u postgres pg_dump rslvd | gzip > ${backupPath}`);
    } else if (type === 'config') {
      // Configs only
      await execPromise(`tar -czf ${backupPath} -C /etc/nginx/sites-available rslvd -C /etc/systemd/system rslvd.service -C /opt/rslvd .env 2>/dev/null || tar -czf ${backupPath} --files-from /dev/null`);
    }
    
    res.json({ success: true, filename: backupName });
  } catch (err) {
    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

router.post('/backups/:filename/restore', requireSiteOwner, async (req, res) => {
  const { filename } = req.params;
  const backupPath = `${BACKUP_DIR}/${filename}`;
  
  if (!filename.match(/^rslvd-(full|database|config)-backup-[^/]+\.tar\.gz$/)) {
    return res.status(400).json({ error: 'Invalid backup filename' });
  }
  
  try {
    // Check if backup exists
    await execPromise(`test -f "${backupPath}"`);
    
    const tempDir = `/tmp/rslvd-restore-${Date.now()}`;
    await execPromise(`mkdir -p ${tempDir}`);
    await execPromise(`tar -xzf "${backupPath}" -C ${tempDir}`);
    
    // Determine backup type and restore accordingly
    if (filename.includes('database')) {
      // Database restore
      await execPromise(`gunzip -c "${backupPath}" | sudo -u postgres psql rslvd`);
    } else if (filename.includes('full')) {
      // Full restore - requires confirmation and stops services
      return res.status(400).json({ 
        error: 'Full restore requires manual intervention. Extract the backup and follow the restore procedure in the documentation.' 
      });
    } else if (filename.includes('config')) {
      // Config restore
      await execPromise(`sudo cp ${tempDir}/rslvd /etc/nginx/sites-available/ 2>/dev/null || true`);
      await execPromise(`sudo cp ${tempDir}/rslvd.service /etc/systemd/system/ 2>/dev/null || true`);
      await execPromise(`sudo cp ${tempDir}/.env /opt/rslvd/ 2>/dev/null || true`);
      await execPromise('sudo systemctl daemon-reload');
    }
    
    await execPromise(`rm -rf ${tempDir}`);
    res.json({ success: true, message: 'Restore completed. Restart services if needed.' });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

router.get('/backups/:filename/download', requireSiteOwner, async (req, res) => {
  const { filename } = req.params;
  const backupPath = `${BACKUP_DIR}/${filename}`;
  
  if (!filename.match(/^rslvd-(full|database|config)-backup-[^/]+\.tar\.gz$/)) {
    return res.status(400).json({ error: 'Invalid backup filename' });
  }
  
  try {
    res.download(backupPath, filename);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

router.delete('/backups/:filename', requireSiteOwner, async (req, res) => {
  const { filename } = req.params;
  const backupPath = `${BACKUP_DIR}/${filename}`;
  
  if (!filename.match(/^rslvd-(full|database|config)-backup-[^/]+\.tar\.gz$/)) {
    return res.status(400).json({ error: 'Invalid backup filename' });
  }
  
  try {
    await execPromise(`rm "${backupPath}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ── Server Stats & Logs (site_owner only) ───────────────────────────────────
router.get('/server-stats', requireSiteOwner, async (req, res) => {
  try {
    const [disk, memory, load, uptime] = await Promise.all([
      execPromise("df -h / | tail -1 | awk '{print $5}'"),
      execPromise("free -m | grep Mem | awk '{print $3\" / \"$2 \" MB\"}'"),
      execPromise("uptime | awk -F'load average:' '{print $2}'"),
      execPromise("uptime -p"),
    ]);
    
    res.json({
      disk: disk.stdout.trim(),
      memory: memory.stdout.trim(),
      load: load.stdout.trim(),
      uptime: uptime.stdout.trim()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch server stats' });
  }
});

router.get('/logs/:service', requireSiteOwner, async (req, res) => {
  const { service } = req.params;
  const { lines = 100 } = req.query;
  
  if (!MANAGED_SERVICES.find(s => s.name === service) && !['app', 'error'].includes(service)) {
    return res.status(400).json({ error: 'Unknown service' });
  }
  
  try {
    let cmd;
    if (service === 'app') {
      cmd = `sudo journalctl -u rslvd -n ${lines} --no-pager`;
    } else if (service === 'error') {
      cmd = `sudo tail -n ${lines} /var/log/nginx/error.log`;
    } else {
      cmd = `sudo journalctl -u ${service} -n ${lines} --no-pager`;
    }
    
    const { stdout } = await execPromise(cmd);
    res.json({ logs: stdout.split('\n') });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;
