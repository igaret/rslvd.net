#!/bin/bash
# Insert the connection_upgrade map into nginx.conf after 'http {'
# Only add if not already present
if grep -q 'connection_upgrade' /etc/nginx/nginx.conf; then
  echo "map already present, skipping"
  exit 0
fi

sed -i 's|http {|http {\n    map $http_upgrade $connection_upgrade {\n        default upgrade;\n        ""      close;\n    }|' /etc/nginx/nginx.conf

echo "Added connection_upgrade map:"
grep -A5 'map.*http_upgrade' /etc/nginx/nginx.conf
