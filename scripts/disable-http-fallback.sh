#!/bin/bash
# disable-http-fallback.sh <fqdn>
# Removes the per-FQDN HTTP server block, restoring the default HTTP->HTTPS redirect.
# Called when a user sets force_https=true or when a host/tunnel is deleted.
set -euo pipefail
FQDN="${1:?Usage: disable-http-fallback.sh <fqdn>}"
CONF="/etc/nginx/conf.d/rslvd-http/${FQDN}.conf"

[ -f "$CONF" ] || { echo "[http-fallback] no config for ${FQDN}, nothing to remove"; exit 0; }

rm -f "$CONF"
nginx -t && systemctl reload nginx
echo "[http-fallback] disabled HTTP fallback for ${FQDN}"
