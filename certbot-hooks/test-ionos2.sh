#!/bin/bash
IONOS_API_KEY="$(grep IONOS_API_KEY /opt/rslvd/.env | cut -d= -f2- | tr -d '[:space:]')"
ZONE_ID="20f53474-75e0-11f0-bd42-0a5864440bad"

echo "--- POST with verbose response ---"
HTTP_CODE=$(curl -s -o /tmp/ionos_response.txt -w "%{http_code}" -X POST \
  "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}/records" \
  -H "X-API-Key: ${IONOS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{"name":"_acme-challenge","type":"TXT","content":"test-value-12345","ttl":60,"disabled":false}]')

echo "HTTP Status: $HTTP_CODE"
echo "Response body:"
cat /tmp/ionos_response.txt
echo ""

# If that failed, check what the IONOS API expects for the zone endpoint
echo ""
echo "--- Zone info ---"
curl -s "https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}" \
  -H "X-API-Key: ${IONOS_API_KEY}" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('name:', d.get('name'))
print('type:', d.get('type'))
print('records count:', len(d.get('records', [])))
"
