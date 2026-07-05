#!/usr/bin/env bash
# Full rslvd.net site backup for cloud migration / disaster recovery.
# Run on the production server as a sudo-capable user.
# Produces a single archive containing everything needed to rebuild the site
# on a new host (see scripts/RESTORE.md).
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
DIR=$(mktemp -d /tmp/rslvd-backup.XXXXXX)
OUT=${1:-/tmp/rslvd-full-backup-$STAMP.tgz}

echo "==> Dumping PostgreSQL database"
sudo -u postgres pg_dump rslvd | gzip > "$DIR/database-rslvd.sql.gz"

echo "==> Archiving application files (/opt/rslvd, incl. .env)"
sudo tar czf "$DIR/app-opt-rslvd.tgz" --exclude=rslvd/node_modules --exclude=rslvd/backups -C /opt rslvd

echo "==> Archiving nginx configuration"
sudo tar czf "$DIR/nginx.tgz" -C /etc nginx/nginx.conf nginx/sites-available nginx/sites-enabled

echo "==> Archiving SSL certificates (/etc/letsencrypt)"
sudo tar czf "$DIR/letsencrypt.tgz" -C /etc letsencrypt

echo "==> Capturing systemd unit and firewall rules"
sudo cp /etc/systemd/system/rslvd.service "$DIR/" 2>/dev/null || sudo cp /opt/rslvd/rslvd.service "$DIR/"
sudo iptables-save > "$DIR/iptables.rules"

echo "==> Bundling"
sudo tar czf "$OUT" -C "$DIR" .
sudo rm -rf "$DIR"
echo "Backup written to $OUT"
