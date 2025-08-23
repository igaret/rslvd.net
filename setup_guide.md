# RSLVD.net Dynamic DNS Service - Setup Guide

## Overview

RSLVD.net is a dynamic DNS service built on modified Pi-hole components. It allows users to register and manage their own subdomains, with free subdomains at `x.my.rslvd.net` and premium subdomains at `x.rslvd.net`.

This guide will walk you through the installation and configuration process for setting up your own RSLVD.net server.

## System Requirements

- **Operating System**: Debian 10+, Ubuntu 20.04+, or Raspberry Pi OS
- **CPU**: 1+ GHz processor (2+ GHz recommended for higher traffic)
- **RAM**: 1 GB minimum (2+ GB recommended)
- **Storage**: 10 GB minimum
- **Network**: Static IP address or stable DHCP reservation
- **Domain**: A registered domain name with DNS control

## Prerequisites

Before starting the installation, make sure you have:

1. A registered domain name (e.g., `rslvd.net`)
2. DNS control to point your domain to your server's IP address
3. Root access to your server
4. A static IP address for your server
5. Basic knowledge of Linux command line

## Pre-Installation Steps

### 1. Set up DNS Records

Create the following DNS records for your domain:

- **A Record**: `rslvd.net` → Your server's IP address
- **A Record**: `www.rslvd.net` → Your server's IP address
- **A Record**: `api.rslvd.net` → Your server's IP address
- **NS Record**: `my.rslvd.net` → `rslvd.net`
- **NS Record**: `*.my.rslvd.net` → `rslvd.net`

### 2. Update Your System

```bash
sudo apt update
sudo apt upgrade -y
```

### 3. Install Basic Dependencies

```bash
sudo apt install -y curl git wget
```

## Installation Options

You have two options for installing RSLVD.net:

1. **Automated Installation**: Using the setup script (recommended)
2. **Manual Installation**: Step-by-step installation for advanced users

## Option 1: Automated Installation

### 1. Download the Setup Script

```bash
curl -sSL https://raw.githubusercontent.com/yourusername/rslvd/main/setup.sh -o setup.sh
chmod +x setup.sh
```

### 2. Run the Setup Script

```bash
sudo ./setup.sh
```

The script will guide you through the installation process, asking for:

- Your domain name
- Administrator email address
- Database configuration
- Payment gateway configuration (if you want to offer premium domains)

### 3. Post-Installation

After the script completes, you'll receive:

- Admin interface URL
- API endpoint URL
- Admin credentials

## Option 2: Manual Installation

If you prefer to install RSLVD.net manually, follow these steps:

### 1. Clone the Repositories

```bash
mkdir -p /opt/rslvd
cd /opt/rslvd
git clone --depth=1 https://github.com/pi-hole/pi-hole.git pihole
git clone --depth=1 https://github.com/pi-hole/AdminLTE.git admin
git clone --depth=1 https://github.com/pi-hole/FTL.git ftl
```

### 2. Install Dependencies

```bash
sudo apt update
sudo apt install -y curl git sqlite3 php-cli php-sqlite3 php-json php-curl nginx dnsutils net-tools jq \
                    build-essential cmake libgmp-dev nettle-dev libnetfilter-conntrack-dev \
                    libidn2-0-dev nettle-dev libidn11-dev libreadline-dev libluajit-5.1-dev \
                    php-fpm php-xml php-mbstring php-zip unzip
```

### 3. Create Database

```bash
mkdir -p /opt/rslvd/data
sqlite3 /opt/rslvd/data/rslvd.db < /opt/rslvd/database_schema.sql
chmod 664 /opt/rslvd/data/rslvd.db
chown www-data:www-data /opt/rslvd/data
chown www-data:www-data /opt/rslvd/data/rslvd.db
```

### 4. Modify Pi-hole Core

Create custom scripts for user and domain management:

```bash
mkdir -p /opt/rslvd/custom/core/scripts
# Create user_management.sh and domain_management.sh scripts
chmod +x /opt/rslvd/custom/core/scripts/user_management.sh
chmod +x /opt/rslvd/custom/core/scripts/domain_management.sh
```

### 5. Modify AdminLTE

Create custom AdminLTE files:

```bash
mkdir -p /opt/rslvd/custom/admin/scripts/php
mkdir -p /opt/rslvd/custom/admin/scripts/js
mkdir -p /opt/rslvd/custom/admin/style/css
# Create custom AdminLTE files
```

### 6. Modify FTL

Create custom FTL files:

```bash
mkdir -p /opt/rslvd/custom/ftl/src
# Create custom FTL files
```

### 7. Create Configuration Files

```bash
mkdir -p /etc/rslvd
# Create rslvd.conf configuration file
```

### 8. Install Pi-hole

```bash
cd /opt/rslvd/pihole
bash -c "PIHOLE_SKIP_OS_CHECK=true PH_TEST=true bash ./automated\ install/basic-install.sh --unattended /tmp/setupVars.conf"
```

### 9. Install AdminLTE

```bash
cp -r /opt/rslvd/admin/* /var/www/html/
cp -r /opt/rslvd/custom/admin/* /var/www/html/
chown -R www-data:www-data /var/www/html
```

### 10. Build and Install FTL

```bash
cd /opt/rslvd/ftl
patch -p1 < /opt/rslvd/custom/ftl/rslvd_integration.patch
./build.sh
./deploy.sh
```

### 11. Create Admin User

```bash
/usr/local/bin/rslvd-user add admin your@email.com password 1
```

### 12. Set Up SSL

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d rslvd.net -d www.rslvd.net -d api.rslvd.net
```

## Configuration

### Main Configuration File

The main configuration file is located at `/etc/rslvd/rslvd.conf`. It contains:

- Domain configuration
- Administrator email
- Database configuration
- Payment gateway configuration
- Installation directories

### Database Schema

The database schema includes tables for:

- Users
- Domains
- Domain updates
- Payments
- API requests
- Settings

### Web Server Configuration

The web server configuration is located at `/etc/nginx/sites-available/rslvd`. It includes:

- HTTP to HTTPS redirection
- SSL configuration
- Web root configuration
- PHP processing
- API routing

## Usage

### Admin Interface

Access the admin interface at `https://your-domain.com/admin`. Log in with the admin credentials provided during installation.

### User Management

To manage users from the command line:

```bash
# Add a user
rslvd-user add username email@example.com password [is_admin]

# Delete a user
rslvd-user delete username

# List users
rslvd-user list

# Reset a user's password
rslvd-user reset-password username new_password
```

### Domain Management

To manage domains from the command line:

```bash
# Add a domain
rslvd-domain add username subdomain type target_ip
# Example: rslvd-domain add john example free 192.168.1.1

# Delete a domain
rslvd-domain delete domain.my.rslvd.net

# Update a domain's IP address
rslvd-domain update domain.my.rslvd.net 192.168.1.2

# List domains
rslvd-domain list [username]
```

### API Usage

The API is accessible at `https://api.your-domain.com/v1`. All API requests require authentication using an API key.

Example API request to update a domain's IP address:

```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_ip":"192.168.1.2"}' \
  https://api.your-domain.com/v1/domains/1
```

## Troubleshooting

### Common Issues

1. **DNS Resolution Issues**
   - Check that your domain's DNS records are correctly configured
   - Verify that Pi-hole's DNS service is running: `systemctl status pihole-FTL`

2. **Web Interface Not Accessible**
   - Check that nginx is running: `systemctl status nginx`
   - Verify that the web files have correct permissions

3. **Database Connection Issues**
   - Check the database configuration in `/etc/rslvd/rslvd.conf`
   - Verify that the database file exists and has correct permissions

### Logs

Check the following logs for troubleshooting:

- **Pi-hole FTL**: `/var/log/pihole-FTL.log`
- **Web Server**: `/var/log/nginx/rslvd.access.log` and `/var/log/nginx/rslvd.error.log`
- **API**: `/var/log/nginx/rslvd-api.access.log` and `/var/log/nginx/rslvd-api.error.log`

## Maintenance

### Backup

Regularly backup the following:

- Database: `/opt/rslvd/data/rslvd.db` (if using SQLite)
- Configuration: `/etc/rslvd/rslvd.conf`
- Custom files: `/opt/rslvd/custom/`

### Updates

To update RSLVD.net:

1. Backup your data
2. Pull the latest changes from the repositories
3. Run the update script: `sudo ./update.sh`

## Security Considerations

1. **Keep Your System Updated**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Use Strong Passwords**
   - Use strong passwords for all accounts
   - Consider implementing two-factor authentication

3. **Firewall Configuration**
   - Only open necessary ports (80, 443, 53)
   - Use a firewall like UFW to restrict access

4. **Regular Monitoring**
   - Monitor logs for suspicious activity
   - Set up alerts for unusual traffic patterns

## Support and Resources

- **Documentation**: `/opt/rslvd/docs/`
- **GitHub Repository**: [https://github.com/yourusername/rslvd](https://github.com/yourusername/rslvd)
- **Issue Tracker**: [https://github.com/yourusername/rslvd/issues](https://github.com/yourusername/rslvd/issues)

## License

RSLVD.net is based on Pi-hole, which is licensed under the EUPL. See the LICENSE file for details.