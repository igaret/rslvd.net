#!/bin/bash
# enable-http-fallback.sh <fqdn>
# Creates a per-FQDN nginx server block that serves HTTP without redirect.
# Called when a user sets force_https=false on a host or tunnel.
set -euo pipefail
FQDN="${1:?Usage: enable-http-fallback.sh <fqdn>}"
CONF_DIR="/etc/nginx/conf.d/rslvd-http"
mkdir -p "$CONF_DIR"

cat > "${CONF_DIR}/${FQDN}.conf" <<NGINX
server {
    listen 80;
    server_name ${FQDN};

    client_max_body_size 0;
    proxy_request_buffering off;
    proxy_buffering off;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
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
}
NGINX

nginx -t && systemctl reload nginx
echo "[http-fallback] enabled HTTP for ${FQDN}"
