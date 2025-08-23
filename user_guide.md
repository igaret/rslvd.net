# RSLVD.net Dynamic DNS Service - User Guide

## Introduction

Welcome to RSLVD.net, your solution for dynamic DNS hosting. This guide will help you understand how to use our service to create and manage your own subdomains.

## What is RSLVD.net?

RSLVD.net is a dynamic DNS service that allows you to:

- Create and manage your own subdomains
- Automatically update your IP address when it changes
- Access your home network, servers, or IoT devices using a memorable domain name
- Choose between free subdomains (`yourname.my.rslvd.net`) or premium subdomains (`yourname.rslvd.net`)

## Getting Started

### Creating an Account

1. Visit [https://rslvd.net/register](https://rslvd.net/register)
2. Fill in the registration form:
   - Username (3-50 characters, letters, numbers, and underscores only)
   - Email address (must be valid for verification)
   - Password (minimum 8 characters)
   - Confirm password
   - Accept the Terms of Service
3. Click "Register"
4. Check your email for a verification link
5. Click the verification link to activate your account

### Logging In

1. Visit [https://rslvd.net/login](https://rslvd.net/login)
2. Enter your username or email address
3. Enter your password
4. Click "Log in"

## Managing Your Domains

### Dashboard Overview

After logging in, you'll see your dashboard with the following sections:

- **Domains**: List of your registered domains
- **Account**: Your account information and settings
- **API Keys**: Manage your API keys for automated updates

### Creating a Free Domain

1. From your dashboard, click "Add Domain"
2. Enter your desired subdomain name (e.g., "myserver" for myserver.my.rslvd.net)
3. Select "Free Domain" (.my.rslvd.net)
4. Enter the IP address you want to point to, or click "Detect My IP" to use your current IP
5. Click "Save Domain"

### Creating a Premium Domain

1. From your dashboard, click "Add Domain"
2. Enter your desired subdomain name (e.g., "myserver" for myserver.rslvd.net)
3. Select "Premium Domain" (.rslvd.net)
4. Enter the IP address you want to point to, or click "Detect My IP" to use your current IP
5. Select your billing cycle (monthly or yearly)
6. Select your payment method
7. Click "Save Domain"
8. Complete the payment process

### Updating Your Domain's IP Address

#### Manual Update

1. From your dashboard, find the domain you want to update
2. Click the "Edit" button
3. Enter the new IP address or click "Detect My IP"
4. Click "Update Domain"

#### Automatic Updates

You can set up automatic updates using our:

1. **Client Applications**: Available for Windows, macOS, Linux, and mobile devices
2. **API**: For custom integrations and scripts
3. **Update URL**: For simple updates from any device

## Client Applications

### Windows Client

1. Download the RSLVD Windows Client from [https://rslvd.net/downloads/windows](https://rslvd.net/downloads/windows)
2. Install the application
3. Enter your API key (found in your dashboard under "API Keys")
4. Select the domains you want to update automatically
5. Configure update frequency (default: every 15 minutes)
6. Click "Save" and minimize to system tray

### macOS Client

1. Download the RSLVD macOS Client from [https://rslvd.net/downloads/macos](https://rslvd.net/downloads/macos)
2. Install the application
3. Enter your API key (found in your dashboard under "API Keys")
4. Select the domains you want to update automatically
5. Configure update frequency (default: every 15 minutes)
6. Click "Save" and minimize to menu bar

### Linux Client

1. Download the RSLVD Linux Client from [https://rslvd.net/downloads/linux](https://rslvd.net/downloads/linux)
2. Extract the archive
3. Run the installation script: `sudo ./install.sh`
4. Configure the client: `sudo rslvd-config`
5. Enter your API key (found in your dashboard under "API Keys")
6. Select the domains you want to update automatically
7. Configure update frequency (default: every 15 minutes)
8. Start the service: `sudo systemctl start rslvd-client`

### Mobile Apps

1. Download the RSLVD app from:
   - [Google Play Store](https://play.google.com/store/apps/details?id=net.rslvd.app)
   - [Apple App Store](https://apps.apple.com/app/rslvd/id1234567890)
2. Open the app
3. Enter your API key or scan the QR code from your dashboard
4. Configure update settings
5. Enable background updates

## Using the API

### Getting Your API Key

1. Log in to your dashboard
2. Go to "API Keys"
3. Your API key will be displayed
4. To generate a new key, click "Regenerate API Key" (this will invalidate your old key)

### API Endpoints

Base URL: `https://api.rslvd.net/v1`

All API requests must include your API key in the Authorization header:
```
Authorization: Bearer YOUR_API_KEY
```

#### List Your Domains

```
GET /domains
```

#### Get Domain Details

```
GET /domains/{domain_id}
```

#### Update Domain IP

```
PUT /domains/{domain_id}
```

Request body:
```json
{
  "target_ip": "192.168.1.2"
}
```

#### Quick Update URL

For simple updates, you can use:
```
GET /update?domain=yourdomain.my.rslvd.net&ip=192.168.1.2
```

### API Rate Limits

- Free accounts: 100 requests per hour
- Premium accounts: 1000 requests per hour

## Using Update URL with Common Devices

### Router Integration

Many routers support dynamic DNS services. Here's how to configure some popular models:

#### DD-WRT

1. Access your router's admin interface
2. Go to Setup > DDNS
3. Set DDNS Service to "Custom"
4. Set DYNDNS Server to `api.rslvd.net`
5. Set URL to `/v1/update?domain=yourdomain.my.rslvd.net&ip=`
6. Set Username to your API key
7. Leave Password blank
8. Save and Apply Settings

#### Asus Routers

1. Access your router's admin interface
2. Go to Advanced Settings > WAN > DDNS
3. Set Server to "Custom"
4. Set Host Name to your full domain (e.g., yourdomain.my.rslvd.net)
5. Set DDNS Server to `api.rslvd.net`
6. Set URL to `/v1/update?domain=`
7. Set Username to your API key
8. Leave Password blank
9. Click Apply

#### pfSense

1. Access your pfSense web interface
2. Go to Services > Dynamic DNS
3. Click "Add"
4. Set Service Type to "Custom"
5. Set Interface to your WAN interface
6. Set Hostname to your full domain (e.g., yourdomain.my.rslvd.net)
7. Set Username to your API key
8. Leave Password blank
9. Set Update URL to `https://api.rslvd.net/v1/update?domain=%h&ip=%i`
10. Click Save

### Home Assistant Integration

1. Edit your `configuration.yaml` file
2. Add the following:

```yaml
rest_command:
  update_rslvd:
    url: "https://api.rslvd.net/v1/update?domain=yourdomain.my.rslvd.net&ip={{ states('sensor.public_ip') }}"
    method: GET
    headers:
      Authorization: "Bearer YOUR_API_KEY"

automation:
  - alias: "Update RSLVD DNS"
    trigger:
      - platform: state
        entity_id: sensor.public_ip
    action:
      - service: rest_command.update_rslvd
```

3. Restart Home Assistant

### Raspberry Pi Script

Create a simple update script:

```bash
#!/bin/bash

API_KEY="YOUR_API_KEY"
DOMAIN="yourdomain.my.rslvd.net"

# Get current IP
IP=$(curl -s https://api.ipify.org)

# Update domain
curl -s -X GET \
  -H "Authorization: Bearer $API_KEY" \
  "https://api.rslvd.net/v1/update?domain=$DOMAIN&ip=$IP"

echo "Updated $DOMAIN to $IP"
```

Add to crontab to run every hour:
```
0 * * * * /path/to/update_script.sh
```

## Account Management

### Updating Your Profile

1. Log in to your dashboard
2. Go to "Account"
3. Update your information
4. Click "Save Changes"

### Changing Your Password

1. Log in to your dashboard
2. Go to "Account"
3. Click "Change Password"
4. Enter your current password
5. Enter your new password
6. Confirm your new password
7. Click "Update Password"

### Managing API Keys

1. Log in to your dashboard
2. Go to "API Keys"
3. To regenerate your API key, click "Regenerate API Key"
4. Note: This will invalidate your old key, and you'll need to update all your clients

## Premium Features

### Upgrading to Premium

1. Log in to your dashboard
2. Go to "Account"
3. Click "Upgrade to Premium"
4. Select your billing cycle (monthly or yearly)
5. Complete the payment process

### Premium Benefits

- Direct subdomains under rslvd.net (e.g., yourname.rslvd.net)
- Higher API rate limits (1000 requests per hour)
- Priority support
- Up to 10 premium domains per account

### Managing Subscriptions

1. Log in to your dashboard
2. Go to "Account" > "Subscriptions"
3. View your active subscriptions
4. Cancel or modify subscriptions as needed

## Troubleshooting

### Common Issues

#### Domain Not Updating

1. Verify your API key is correct
2. Check that you're using the correct domain name
3. Ensure your client or script is running correctly
4. Check the API rate limits

#### Domain Not Resolving

1. Verify the domain exists in your dashboard
2. Check that the IP address is correct
3. Allow time for DNS propagation (up to 5 minutes)
4. Try flushing your DNS cache

#### API Key Not Working

1. Verify you're using the correct API key
2. Check if you've recently regenerated your API key
3. Ensure you're including the "Bearer" prefix in the Authorization header

### Getting Support

If you encounter any issues:

1. Check the [FAQ](https://rslvd.net/faq)
2. Visit our [Knowledge Base](https://rslvd.net/kb)
3. Contact support at [support@rslvd.net](mailto:support@rslvd.net)
4. For premium users, use the priority support form in your dashboard

## Best Practices

1. **Regular Updates**: Ensure your clients are updating regularly to maintain accurate DNS records
2. **API Key Security**: Keep your API key secure and don't share it publicly
3. **Multiple Domains**: Use descriptive names for different devices or services
4. **Monitoring**: Set up monitoring to ensure your domains are always pointing to the correct IP
5. **Backup**: Note your domain names and API key in a secure location

## Frequently Asked Questions

### General Questions

**Q: What is dynamic DNS?**  
A: Dynamic DNS allows you to map a domain name to a dynamic IP address that may change over time.

**Q: How often should I update my IP address?**  
A: Most residential ISPs change IP addresses infrequently. Updating every 15-60 minutes is usually sufficient.

**Q: Can I use RSLVD.net with HTTPS/SSL?**  
A: Yes, you can use services like Let's Encrypt to add SSL to your domains.

### Technical Questions

**Q: What record types does RSLVD.net support?**  
A: Currently, RSLVD.net supports A records (IPv4) and AAAA records (IPv6).

**Q: What is the TTL for DNS records?**  
A: The default TTL is 300 seconds (5 minutes) to ensure quick updates.

**Q: Can I use RSLVD.net with my own domain?**  
A: Not directly. RSLVD.net only supports subdomains under rslvd.net and my.rslvd.net.

### Account Questions

**Q: How many free domains can I create?**  
A: Free accounts can create up to 3 subdomains under my.rslvd.net.

**Q: How many premium domains can I create?**  
A: Premium accounts can create up to 10 subdomains under rslvd.net.

**Q: Can I transfer domains between accounts?**  
A: No, domains cannot be transferred between accounts at this time.

## Terms of Service

Please review our full [Terms of Service](https://rslvd.net/terms) for complete details on using RSLVD.net.

Key points:

1. You are responsible for the content served through your domains
2. Abusive or illegal use of the service is prohibited
3. Free accounts are limited to 3 domains and 100 API requests per hour
4. Premium accounts are limited to 10 domains and 1000 API requests per hour
5. We reserve the right to suspend or terminate accounts that violate our terms

## Privacy Policy

Please review our full [Privacy Policy](https://rslvd.net/privacy) for details on how we handle your data.

Key points:

1. We collect minimal information necessary to provide the service
2. We do not sell or share your personal information with third parties
3. We log IP addresses for security and troubleshooting purposes
4. You can request deletion of your account and associated data at any time