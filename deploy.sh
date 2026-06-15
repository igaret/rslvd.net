#!/bin/bash
set -e

echo "==> Creating app user and directory"
id -u rslvd &>/dev/null || sudo useradd -r -s /bin/false rslvd
sudo mkdir -p /opt/rslvd/public
sudo chown -R rslvd:rslvd /opt/rslvd

echo "==> Copying app files"
sudo cp -r /tmp/rslvd-app/server.js /opt/rslvd/
sudo cp -r /tmp/rslvd-app/package.json /opt/rslvd/
sudo cp -r /tmp/rslvd-app/.env /opt/rslvd/
sudo cp -r /tmp/rslvd-app/routes /opt/rslvd/
sudo cp -r /tmp/rslvd-app/db /opt/rslvd/
sudo cp -r /tmp/rslvd-app/lib /opt/rslvd/
sudo cp -r /tmp/rslvd-app/middleware /opt/rslvd/
sudo cp -r /tmp/rslvd-app/public/* /opt/rslvd/public/

echo "==> Installing certbot hooks"
sudo mkdir -p /opt/rslvd/certbot-hooks
sudo cp /tmp/rslvd-app/../certbot-hooks/* /opt/rslvd/certbot-hooks/
sudo chmod +x /opt/rslvd/certbot-hooks/*.sh

echo "==> Creating auto-SSL certificate directory"
sudo mkdir -p /etc/nginx/conf.d/rslvd-certs

echo "==> Installing npm dependencies"
cd /opt/rslvd
sudo -u rslvd npm install --production --silent

echo "==> Installing systemd service"
sudo cp /tmp/rslvd-app/rslvd.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rslvd
sudo systemctl restart rslvd

echo "==> Configuring nginx"
sudo cp /tmp/rslvd-app/nginx-http.conf /etc/nginx/sites-available/rslvd.net
sudo ln -sf /etc/nginx/sites-available/rslvd.net /etc/nginx/sites-enabled/rslvd.net
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "==> Requesting wildcard SSL certificate (DNS-01 via IONOS)"
sudo certbot certonly --manual --preferred-challenges=dns \
  --manual-auth-hook=/opt/rslvd/certbot-hooks/ionos-auth.sh \
  --manual-cleanup-hook=/opt/rslvd/certbot-hooks/ionos-cleanup.sh \
  -d "rslvd.net" -d "*.rslvd.net" \
  --non-interactive --agree-tos --email admin@rslvd.net \
  --cert-name rslvd.net \
  --deploy-hook=/opt/rslvd/certbot-hooks/renew-deploy.sh \
  || echo "Wildcard cert already exists or failed - check manually"

echo "==> Updating nginx with full SSL config"
sudo cp /tmp/rslvd-nginx/nginx-rslvd.conf /etc/nginx/sites-available/rslvd.net
sudo nginx -t && sudo systemctl reload nginx

echo "==> Setting up certbot renewal timer"
# certbot auto-renewal is typically handled by the certbot package's systemd
# timer or cron. Ensure deploy hook runs on renewal:
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo ln -sf /opt/rslvd/certbot-hooks/renew-deploy.sh /etc/letsencrypt/renewal-hooks/deploy/rslvd-reload-nginx.sh

echo "==> Granting rslvd user cert provisioning permissions"
# Allow the rslvd service user to run certbot and nginx reload via sudoers
SUDOERS_FILE="/etc/sudoers.d/rslvd-ssl"
if [ ! -f "$SUDOERS_FILE" ]; then
  cat <<EOF | sudo tee "$SUDOERS_FILE" > /dev/null
# Allow rslvd service to provision SSL certs and reload nginx
rslvd ALL=(ALL) NOPASSWD: /usr/bin/certbot certonly --manual --preferred-challenges=dns *
rslvd ALL=(ALL) NOPASSWD: /usr/sbin/nginx -s reload
EOF
  sudo chmod 440 "$SUDOERS_FILE"
fi

echo "==> Checking service status"
sleep 2
sudo systemctl status rslvd --no-pager

echo ""
echo "✓ Deployment complete! https://rslvd.net"
echo "  Nested subdomains will auto-provision SSL certs via DNS-01."
echo "  HTTP fallback active for nested subdomains while certs provision."
