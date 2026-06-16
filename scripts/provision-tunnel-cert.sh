#!/bin/bash
# provision-tunnel-cert.sh <fqdn>
# Issues a Let's Encrypt cert for a nested tunnel FQDN via IONOS DNS-01,
# writes an nginx server block (443 -> tunnel proxy 8080, 80 -> redirect),
# and reloads nginx. Idempotent.
set -uo pipefail

FQDN="${1:-}"
LOG=/var/log/tunnel-cert.log
exec >> "$LOG" 2>&1
echo "=== $(date -Is) provision ${FQDN} ==="

if [ -z "$FQDN" ]; then echo "ERROR: no FQDN given"; exit 1; fi

# Defense-in-depth: only allow valid rslvd.net FQDNs (prevents command/arg injection)
if ! echo "$FQDN" | grep -qE '^[a-z0-9]([a-z0-9.-]{0,250}[a-z0-9])?\.rslvd\.net$'; then
  echo "ERROR: invalid FQDN: ${FQDN}"; exit 1
fi

CONF="/etc/nginx/conf.d/tunnel-${FQDN}.conf"

# Issue cert if not already present
if [ ! -d "/etc/letsencrypt/live/${FQDN}" ]; then
  echo "Issuing cert for ${FQDN} via IONOS DNS-01..."
  certbot certonly --non-interactive --agree-tos \
    --manual --preferred-challenges dns-01 \
    --manual-auth-hook /opt/rslvd/certbot-hooks/ionos-auth.sh \
    --manual-cleanup-hook /opt/rslvd/certbot-hooks/ionos-cleanup.sh \
    --cert-name "${FQDN}" \
    -d "${FQDN}" \
    --deploy-hook 'systemctl reload nginx'
  if [ $? -ne 0 ]; then echo "ERROR: certbot failed for ${FQDN}"; exit 1; fi
else
  echo "Cert already exists for ${FQDN}"
fi

# Write nginx server block ($connection_upgrade map is defined in nginx.conf)
cat > "$CONF" <<EOF
# Auto-generated per-tunnel cert block for ${FQDN}
server {
    server_name ${FQDN};
    client_max_body_size 0;
    proxy_request_buffering off;
    proxy_buffering off;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/${FQDN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${FQDN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
server {
    listen 80;
    server_name ${FQDN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF

echo "Wrote ${CONF}"
if nginx -t; then
  systemctl reload nginx
  echo "nginx reloaded OK for ${FQDN}"
else
  echo "ERROR: nginx config test failed, removing block"
  rm -f "$CONF"
  systemctl reload nginx || true
  exit 1
fi
echo "=== done ${FQDN} ==="
