#!/bin/bash
set -e
IONOS_API_KEY="$(grep IONOS_API_KEY /opt/rslvd/.env | cut -d= -f2- | tr -d '[:space:]')"
ZONE_ID="20f53474-75e0-11f0-bd42-0a5864440bad"

echo "Key prefix: ${IONOS_API_KEY:0:12}..."

echo "--- Testing TXT record creation ---"
curl -sf -X POST \
  "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}/records" \
  -H "X-API-Key: ${IONOS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{"name":"_acme-challenge","type":"TXT","content":"test-value-12345","ttl":60,"disabled":false}]' \
  && echo "POST OK" || echo "POST FAILED (may already exist)"

echo ""
echo "--- Listing TXT records for _acme-challenge ---"
curl -sf "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}" \
  -H "X-API-Key: ${IONOS_API_KEY}" \
  -H "Accept: application/json" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('records', []):
    if '_acme' in r.get('name','') or r.get('type') == 'TXT':
        print(f\"  {r['id']} | {r['type']} | {r['name']} | {r.get('content','')[:40]}\")
"

echo ""
echo "--- Cleanup test record ---"
RECORD_ID=$(curl -sf "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}" \
  -H "X-API-Key: ${IONOS_API_KEY}" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('records', []):
    if r.get('type') == 'TXT' and '_acme-challenge' in r.get('name','') and 'test-value-12345' in r.get('content',''):
        print(r['id'])
        break
")
if [ -n "$RECORD_ID" ]; then
  curl -sf -X DELETE \
    "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}/records/${RECORD_ID}" \
    -H "X-API-Key: ${IONOS_API_KEY}" && echo "Deleted $RECORD_ID"
else
  echo "No test record found to clean up"
fi
