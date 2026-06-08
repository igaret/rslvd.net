#!/bin/bash
set -e
export PATH=$PATH:/usr/local/go/bin
export GOPATH=/tmp/gopath

mkdir -p /tmp/tbuild /opt/rslvd/public/dl
cd /tmp/tbuild

# Init module
if [ ! -f go.mod ]; then
  go mod init rslvd-tunnel
fi
cp /tmp/tunnel-main.go main.go

echo "Building linux/amd64..."
GOOS=linux  GOARCH=amd64  go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-linux-amd64   .

echo "Building linux/arm64 (64-bit Android/Termux)..."
GOOS=linux  GOARCH=arm64  go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-linux-arm64   .

echo "Building linux/arm (32-bit Android/Termux)..."
GOOS=linux  GOARCH=arm GOARM=7 go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-linux-arm    .

echo "Building linux/mips (big-endian, most OpenWRT/DD-WRT routers)..."
GOOS=linux  GOARCH=mips   GOMIPS=softfloat go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-linux-mips      .

echo "Building linux/mipsle (little-endian MIPS routers)..."
GOOS=linux  GOARCH=mipsle GOMIPS=softfloat go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-linux-mipsle    .

echo "Building linux/mips64 (64-bit MIPS routers)..."
GOOS=linux  GOARCH=mips64   GOMIPS64=softfloat go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-linux-mips64    .

echo "Building darwin/amd64..."
GOOS=darwin GOARCH=amd64  go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-darwin-amd64  .

echo "Building darwin/arm64 (Apple Silicon)..."
GOOS=darwin GOARCH=arm64  go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-darwin-arm64  .

echo "Building windows/amd64..."
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o /opt/rslvd/public/dl/rslvd-tunnel-windows-amd64.exe .

chmod +x /opt/rslvd/public/dl/rslvd-tunnel-*
chown -R rslvd:rslvd /opt/rslvd/public/dl

echo ""
echo "Done! Binaries:"
ls -lh /opt/rslvd/public/dl/
