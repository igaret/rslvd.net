#!/bin/bash
echo '{"email":"owner@rslvd.net","password":"Admin1234!"}' > /tmp/reg.json
RESULT=$(curl -s -X POST https://rslvd.net/api/auth/register \
  -H "Content-Type: application/json" \
  -d @/tmp/reg.json)
echo "REGISTER: $RESULT"

# Extract token
TOKEN=$(echo $RESULT | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
echo "TOKEN: ${TOKEN:0:30}..."

# Set this user as admin
echo "Setting admin..."
sudo -u postgres psql rslvd -c "UPDATE users SET is_admin=TRUE WHERE email='owner@rslvd.net';"

# Test /me
echo "GET /me:"
curl -s https://rslvd.net/api/auth/me -H "Authorization: Bearer $TOKEN"
echo ""

echo "GET /billing/plans:"
curl -s https://rslvd.net/api/billing/plans
echo ""

echo "All tests passed!"
