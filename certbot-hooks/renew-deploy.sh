#!/bin/bash
# Post-renewal deploy hook for certbot
# Reloads nginx after any certificate is renewed so nginx picks up the new cert.
# Used by: certbot renew --deploy-hook /opt/rslvd/certbot-hooks/renew-deploy.sh

echo "[renew-deploy] Certificate renewed for: ${RENEWED_DOMAINS}"
echo "[renew-deploy] Reloading nginx..."
sudo nginx -s reload
echo "[renew-deploy] Done."
