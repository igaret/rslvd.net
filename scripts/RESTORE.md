# rslvd.net — Restore Guide (cloud migration / disaster recovery)

The backup archive produced by `scripts/full-backup.sh` contains:

| File | Contents |
|------|----------|
| `database-rslvd.sql.gz` | Full PostgreSQL dump (users, hosts, tunnels, logs, everything) |
| `app-opt-rslvd.tgz` | Application files from `/opt/rslvd` **including `.env`** (secrets!) |
| `nginx.tgz` | `/etc/nginx/nginx.conf`, `sites-available`, `sites-enabled` |
| `letsencrypt.tgz` | All SSL certificates incl. per-tunnel certs + renewal configs |
| `rslvd.service` | systemd unit |
| `iptables.rules` | Firewall rules (incl. port 25 → 2525 redirect, if present) |

## Restore on a new server (Debian/Ubuntu)

```bash
# 1. Base packages
sudo apt-get update
sudo apt-get install -y nginx postgresql redis-server certbot nodejs npm iptables-persistent

# 2. Database
sudo -u postgres createuser rslvd
sudo -u postgres createdb -O rslvd rslvd
# Set the password to match DATABASE_URL in .env:
sudo -u postgres psql -c "ALTER USER rslvd PASSWORD '<password-from-env>';"
gunzip -c database-rslvd.sql.gz | sudo -u postgres psql rslvd

# 3. Application
sudo tar xzf app-opt-rslvd.tgz -C /opt
cd /opt/rslvd && sudo npm install --omit=dev

# 4. Nginx + SSL
sudo tar xzf nginx.tgz -C /etc
sudo tar xzf letsencrypt.tgz -C /etc
sudo nginx -t && sudo systemctl reload nginx

# 5. Service + firewall
sudo cp rslvd.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now rslvd
sudo iptables-restore < iptables.rules
sudo netfilter-persistent save

# 6. Verify
curl -s -o /dev/null -w '%{http_code}\n' https://rslvd.net/   # expect 200
sudo journalctl -u rslvd -n 20 --no-pager
```

## DNS cutover

1. Update the A record for `rslvd.net` (and `*.rslvd.net`) at IONOS to the new server IP.
2. Update `SERVER_IP` in `/opt/rslvd/.env` on the new host.
3. Keep the old server running until TTL expires so existing tunnel clients and DDNS updaters reconnect cleanly.

## Notes

- `.env` inside `app-opt-rslvd.tgz` contains **all production secrets** (DB, JWT, IONOS, Square, SMTP). Store the backup encrypted / offline.
- Certbot renewals: verify `certbot renew --dry-run` after restore; the IONOS DNS hook scripts are in `/opt/rslvd/certbot-hooks`.
- Tunnel clients reconnect automatically once DNS points at the new host (tokens live in the database).
