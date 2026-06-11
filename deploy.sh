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

echo "==> Requesting SSL certificate"
sudo certbot --nginx -d rslvd.net -d www.rslvd.net \
  --non-interactive --agree-tos --email admin@rslvd.net \
  --redirect || echo "SSL cert already exists or failed - check manually"

echo "==> Updating nginx with SSL config"
sudo cp /tmp/rslvd-app/nginx.conf /etc/nginx/sites-available/rslvd.net
sudo nginx -t && sudo systemctl reload nginx

echo "==> Checking service status"
sleep 2
sudo systemctl status rslvd --no-pager

echo ""
echo "✓ Deployment complete! https://rslvd.net"
