#!/bin/bash
# Certbot DNS-01 cleanup hook for IONOS API
# Called by certbot with:
#   CERTBOT_DOMAIN   = domain being validated
#   CERTBOT_VALIDATION = the TXT value that was set

set -e

IONOS_API_KEY="$(grep IONOS_API_KEY /opt/rslvd/.env | cut -d= -f2- | tr -d '[:space:]')"
ZONE="rslvd.net"
RECORD_FQDN="_acme-challenge.${CERTBOT_DOMAIN}"

echo "[ionos-cleanup] Removing TXT ${RECORD_FQDN}"

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
  echo "[ionos-cleanup] ERROR: Could not find zone ID"
  exit 1
fi

# Get all records in the zone and find matching TXT record IDs
RECORDS=$(curl -sf "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}" \
  -H "X-API-Key: ${IONOS_API_KEY}" \
  -H "Accept: application/json")

RECORD_IDS=$(echo "$RECORDS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
records = data.get('records', [])
for r in records:
    if r.get('type') == 'TXT' and r.get('name','') == '${RECORD_FQDN}' and '${CERTBOT_VALIDATION}' in r.get('content',''):
        print(r['id'])
")

for RID in $RECORD_IDS; do
  echo "[ionos-cleanup] Deleting record $RID"
  curl -sf -X DELETE \
    "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}/records/${RID}" \
    -H "X-API-Key: ${IONOS_API_KEY}" || true
done

echo "[ionos-cleanup] Done."
