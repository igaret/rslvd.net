#!/bin/bash
set -e

VERSION="1.2.0"
ARCHES=("amd64" "arm64")
DEB_ARCH_MAP=("amd64:amd64" "arm64:arm64")

for entry in "${DEB_ARCH_MAP[@]}"; do
  GO_ARCH="${entry%%:*}"
  DEB_ARCH="${entry##*:}"
  
  PKG_DIR="/tmp/rslvd-tunnel_${VERSION}_${DEB_ARCH}"
  rm -rf "$PKG_DIR"
  
  # Directory structure
  mkdir -p "$PKG_DIR/DEBIAN"
  mkdir -p "$PKG_DIR/usr/bin"
  mkdir -p "$PKG_DIR/etc/systemd/system"
  
  # Copy binary
  cp "app/public/dl/rslvd-tunnel-linux-${GO_ARCH}" "$PKG_DIR/usr/bin/rslvd-tunnel"
  chmod 755 "$PKG_DIR/usr/bin/rslvd-tunnel"
  
  # Control file
  SIZE=$(du -s "$PKG_DIR/usr" | cut -f1)
  cat > "$PKG_DIR/DEBIAN/control" << EOF
Package: rslvd-tunnel
Version: ${VERSION}
Section: net
Priority: optional
Architecture: ${DEB_ARCH}
Installed-Size: ${SIZE}
Maintainer: rslvd.net <support@rslvd.net>
Homepage: https://rslvd.net
Description: Dynamic DNS + CGNAT tunnel client for rslvd.net
 A lightweight tunnel client that connects your local services to the
 internet through rslvd.net. Supports TCP, UDP, and DNS2TCP tunneling
 modes. Works behind carrier-grade NAT (CGNAT) without port forwarding.
EOF

  # Systemd service template
  cat > "$PKG_DIR/etc/systemd/system/rslvd-tunnel@.service" << EOF
[Unit]
Description=rslvd.net Tunnel (%i)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/rslvd-tunnel -token %i
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  # Post-install script
  cat > "$PKG_DIR/DEBIAN/postinst" << 'EOF'
#!/bin/sh
systemctl daemon-reload 2>/dev/null || true
echo ""
echo "  rslvd-tunnel installed successfully!"
echo ""
echo "  Usage:"
echo "    rslvd-tunnel -token YOUR_TOKEN -local localhost:8080"
echo ""
echo "  Systemd service (per-tunnel):"
echo "    sudo systemctl enable --now rslvd-tunnel@YOUR_TOKEN"
echo ""
EOF
  chmod 755 "$PKG_DIR/DEBIAN/postinst"

  # Build .deb
  dpkg-deb --build "$PKG_DIR" "app/public/dl/rslvd-tunnel_${VERSION}_${DEB_ARCH}.deb"
  echo "Built: rslvd-tunnel_${VERSION}_${DEB_ARCH}.deb"
done
