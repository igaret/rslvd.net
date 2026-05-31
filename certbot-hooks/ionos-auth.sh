#!/bin/bash
# Certbot DNS-01 auth hook for IONOS API
# Called by certbot with:
#   CERTBOT_DOMAIN   = domain being validated (e.g. rslvd.net)
#   CERTBOT_VALIDATION = the TXT value to set

set -e

IONOS_API_KEY="$(grep IONOS_API_KEY /opt/rslvd/.env | cut -d= -f2- | tr -d '[:space:]')"
ZONE="rslvd.net"
# IONOS expects the full FQDN as the record name
RECORD_FQDN="_acme-challenge.${CERTBOT_DOMAIN}"

echo "[ionos-auth] Setting TXT ${RECORD_FQDN} = ${CERTBOT_VALIDATION}"

# Get zone ID
ZONE_RESP=$(curl -sf "https://api.hosting.ionos.com/dns/v1/zones" \
  -H "X-API-Key: ${IONOS_API_KEY}" \
  -H "Accept: application/json")

ZONE_ID=$(echo "$ZONE_RESP" | python3 -c "
import sys, json
zones = json.load(sys.stdin)
for z in zones:
    if z['name'] == '${ZONE}':
        print(z['id'])
        break
")

if [ -z "$ZONE_ID" ]; then
  echo "[ionos-auth] ERROR: Could not find zone ID for ${ZONE}"
  exit 1
fi

echo "[ionos-auth] Zone ID: $ZONE_ID"

# Create TXT record (IONOS requires full FQDN as name)
PAYLOAD="[{\"name\":\"${RECORD_FQDN}\",\"type\":\"TXT\",\"content\":\"${CERTBOT_VALIDATION}\",\"ttl\":60,\"disabled\":false}]"

RESULT=$(curl -sf -X POST \
  "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}/records" \
  -H "X-API-Key: ${IONOS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "[ionos-auth] Created TXT record. Waiting 15s for DNS propagation..."
sleep 15
