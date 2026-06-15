/**
 * Auto-SSL certificate provisioning for nested subdomains
 *
 * Uses certbot with DNS-01 challenge via IONOS API hooks to provision
 * individual Let's Encrypt certificates for nested subdomains that
 * aren't covered by the *.rslvd.net wildcard cert.
 *
 * Flow:
 *   1. Tunnel/host created → DNS record set (existing code)
 *   2. provisionCert(fqdn) called → certbot issues cert via DNS-01
 *   3. nginx conf snippet generated → nginx reloaded
 *   4. Subdomain now served over HTTPS
 *
 * Until the cert is ready, nginx serves the subdomain over plain HTTP
 * (no redirect to HTTPS for nested subdomains without certs).
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOKS_DIR = process.env.CERTBOT_HOOKS_DIR || '/opt/rslvd/certbot-hooks';
const CERTS_CONF_DIR = process.env.NGINX_CERTS_DIR || '/etc/nginx/conf.d/rslvd-certs';
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'rslvd.net';

function log(...args) {
  console.log('[auto-ssl]', ...args);
}

/**
 * Check if a given FQDN is a nested subdomain (more than one level above base domain)
 */
function isNestedSubdomain(fqdn) {
  const base = BASE_DOMAIN;
  if (!fqdn.endsWith(`.${base}`)) return false;
  const prefix = fqdn.slice(0, -(base.length + 1)); // strip ".rslvd.net"
  return prefix.includes('.'); // has more than one label = nested
}

/**
 * Check if a valid cert already exists for this FQDN
 */
function certExists(fqdn) {
  const certPath = `/etc/letsencrypt/live/${fqdn}/fullchain.pem`;
  try {
    fs.accessSync(certPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Provision a Let's Encrypt certificate for the given FQDN using DNS-01 challenge.
 * Returns a promise that resolves when the cert is ready, or rejects on failure.
 */
function provisionCert(fqdn) {
  return new Promise((resolve, reject) => {
    if (!isNestedSubdomain(fqdn)) {
      // First-level subdomains are covered by the *.rslvd.net wildcard
      resolve({ status: 'wildcard', fqdn });
      return;
    }

    if (certExists(fqdn)) {
      resolve({ status: 'exists', fqdn });
      return;
    }

    log(`Provisioning cert for ${fqdn}...`);

    const authHook = path.join(HOOKS_DIR, 'ionos-auth.sh');
    const cleanupHook = path.join(HOOKS_DIR, 'ionos-cleanup.sh');

    const args = [
      'certbot',
      'certonly',
      '--manual',
      '--preferred-challenges=dns',
      `--manual-auth-hook=${authHook}`,
      `--manual-cleanup-hook=${cleanupHook}`,
      '-d', fqdn,
      '--non-interactive',
      '--agree-tos',
      '--email', `admin@${BASE_DOMAIN}`,
      '--cert-name', fqdn,
    ];

    execFile('sudo', args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        log(`Cert provisioning FAILED for ${fqdn}: ${err.message}`);
        if (stderr) log(`stderr: ${stderr}`);
        reject(new Error(`certbot failed for ${fqdn}: ${err.message}`));
        return;
      }

      log(`Cert provisioned for ${fqdn}`);

      // Generate nginx snippet and reload
      try {
        generateNginxSnippet(fqdn);
        reloadNginx();
        resolve({ status: 'provisioned', fqdn });
      } catch (e) {
        log(`Nginx config failed for ${fqdn}: ${e.message}`);
        // Cert exists even if nginx config fails — still partial success
        resolve({ status: 'cert_only', fqdn, error: e.message });
      }
    });
  });
}

/**
 * Generate an nginx server block for a nested subdomain with its own cert.
 */
function generateNginxSnippet(fqdn) {
  const snippet = `# Auto-generated SSL config for ${fqdn}
server {
    listen 443 ssl http2;
    server_name ${fqdn};

    ssl_certificate /etc/letsencrypt/live/${fqdn}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${fqdn}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 0;
    proxy_request_buffering off;
    proxy_buffering off;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
`;

  // Ensure directory exists
  if (!fs.existsSync(CERTS_CONF_DIR)) {
    fs.mkdirSync(CERTS_CONF_DIR, { recursive: true });
  }

  const confPath = path.join(CERTS_CONF_DIR, `${fqdn}.conf`);
  fs.writeFileSync(confPath, snippet);
  log(`Nginx config written: ${confPath}`);
}

/**
 * Remove nginx snippet when a subdomain is deleted.
 */
function removeCertConfig(fqdn) {
  const confPath = path.join(CERTS_CONF_DIR, `${fqdn}.conf`);
  try {
    fs.unlinkSync(confPath);
    log(`Nginx config removed: ${confPath}`);
    reloadNginx();
  } catch {
    // File might not exist — that's fine
  }
}

/**
 * Reload nginx to pick up new cert configs.
 */
function reloadNginx() {
  execFile('sudo', ['/usr/sbin/nginx', '-s', 'reload'], { timeout: 10000 }, (err) => {
    if (err) {
      log(`nginx reload failed: ${err.message}`);
    } else {
      log('nginx reloaded');
    }
  });
}

module.exports = { provisionCert, removeCertConfig, isNestedSubdomain, certExists };
