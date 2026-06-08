#!/bin/bash
# deprovision-tunnel-cert.sh <fqdn>
# Removes the nginx server block and Let's Encrypt cert for a nested tunnel FQDN.
set -uo pipefail

FQDN="${1:-}"
LOG=/var/log/tunnel-cert.log
exec >> "$LOG" 2>&1
echo "=== $(date -Is) deprovision ${FQDN} ==="

if [ -z "$FQDN" ]; then echo "ERROR: no FQDN given"; exit 1; fi

if ! echo "$FQDN" | grep -qE '^[a-z0-9]([a-z0-9.-]{0,250}[a-z0-9])?\.rslvd\.net$'; then
  echo "ERROR: invalid FQDN: ${FQDN}"; exit 1
fi

rm -f "/etc/nginx/conf.d/tunnel-${FQDN}.conf"
echo "Removed nginx block for ${FQDN}"

if nginx -t; then
  systemctl reload nginx
  echo "nginx reloaded OK"
else
  echo "WARNING: nginx test failed after removing block"
fi

certbot delete --cert-name "${FQDN}" --non-interactive 2>/dev/null || true
echo "=== done ${FQDN} ==="
