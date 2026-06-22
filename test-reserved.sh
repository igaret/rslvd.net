#!/bin/bash
echo '{"email":"garet@email.com","password":"impfa6bAQm!xRhfQrilR"}' > /tmp/owner-login.json
TOKEN=$(curl -s -X POST https://rslvd.net/api/auth/login -H "Content-Type: application/json" -d @/tmp/owner-login.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

echo "1. List reserved (first 5):"
curl -s https://rslvd.net/api/admin/reserved -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
items = json.load(sys.stdin)
print(f'  Total: {len(items)}')
for r in items[:5]: print(f'  {r[\"subdomain\"]:20} {r[\"reason\"]}')
print('  ...')
" 2>/dev/null

echo ""
echo "2. Try to register reserved subdomain 'api' as normal flow (should block):"
echo '{"email":"garet@email.com","password":"impfa6bAQm!xRhfQrilR"}' > /tmp/owner-login.json
# Test via hosts endpoint as a regular user would hit it
curl -s -X POST https://rslvd.net/api/hosts -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"hostname":"api"}' 
echo ""

echo ""
echo "3. Add a new custom reservation 'mycompany':"
curl -s -X POST https://rslvd.net/api/admin/reserved -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"subdomain":"mycompany","reason":"Held for partner"}' 
echo ""

echo ""
echo "4. Unreserve 'mycompany' (cleanup):"
ID=$(curl -s https://rslvd.net/api/admin/reserved -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; items=json.load(sys.stdin); [print(r['id']) for r in items if r['subdomain']=='mycompany']" 2>/dev/null)
curl -s -X DELETE "https://rslvd.net/api/admin/reserved/$ID" -H "Authorization: Bearer $TOKEN"
echo ""
echo "Done."
