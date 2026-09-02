#!/usr/bin/env bash
##
## Build the rslvd shell package repository served at https://repo.rslvd.net
##
## Inputs:
##   TERMUX_PACKAGES_DIR  - checkout of termux-packages with
##                          TERMUX_APP__PACKAGE_NAME="net.rslvd.debug" and the
##                          apt sources.list pointed at repo.rslvd.net, with
##                          packages already built into output/ (*.deb)
##   RSLVD_REPO_DIR       - staging dir for the repository (default ./repo-out)
##
## Output layout (rsync RSLVD_REPO_DIR to /opt/rslvd-repo on the server):
##   apt/rslvd-main/dists/stable/main/binary-{aarch64,all}/Packages(.gz)
##   apt/rslvd-main/dists/stable/Release
##   apt/rslvd-main/pool/main/*.deb
##   bootstraps/bootstrap-<arch>.zip(.sha256)
##
set -euo pipefail

TERMUX_PACKAGES_DIR="${TERMUX_PACKAGES_DIR:-$HOME/termux-packages}"
RSLVD_REPO_DIR="${RSLVD_REPO_DIR:-$PWD/repo-out}"
ARCHES="${ARCHES:-aarch64}"

APT_DIR="$RSLVD_REPO_DIR/apt/rslvd-main"
POOL_DIR="$APT_DIR/pool/main"

command -v dpkg-scanpackages >/dev/null || {
    echo "dpkg-scanpackages missing (apt install dpkg-dev)" >&2
    exit 1
}

mkdir -p "$POOL_DIR"
cp -n "$TERMUX_PACKAGES_DIR"/output/*.deb "$POOL_DIR/" 2>/dev/null || true

# Build the rslvd-tunnel package (Go client cross-compiled for each arch).
build_rslvd_tunnel() {
    local arch="$1" goarch deb_arch
    case "$arch" in
        aarch64) goarch=arm64 deb_arch=aarch64 ;;
        arm) goarch=arm deb_arch=arm ;;
        x86_64) goarch=amd64 deb_arch=x86_64 ;;
        *) echo "unknown arch $arch" >&2; return 1 ;;
    esac
    local version
    version="1.3.0"
    local pkgdir
    pkgdir="$(mktemp -d)"
    local prefix="$pkgdir/data/data/net.rslvd.debug/files/usr"
    mkdir -p "$prefix/bin" "$pkgdir/DEBIAN"
    (cd "$(dirname "$0")/../../tunnel-client" &&
        CGO_ENABLED=0 GOOS=linux GOARCH=$goarch go build -trimpath \
            -ldflags "-s -w" -o "$prefix/bin/rslvd-tunnel" .)
    cat > "$pkgdir/DEBIAN/control" <<EOF
Package: rslvd-tunnel
Version: $version
Architecture: $deb_arch
Maintainer: rslvd.net
Description: rslvd.net tunnel client (TCP/UDP/DNS2TCP reverse tunnels)
Homepage: https://rslvd.net
EOF
    dpkg-deb --root-owner-group -Zxz -b "$pkgdir" \
        "$POOL_DIR/rslvd-tunnel_${version}_${deb_arch}.deb"
    rm -rf "$pkgdir"
}

for arch in $ARCHES; do
    build_rslvd_tunnel "$arch"
done

# apt repo metadata
for arch in all $ARCHES; do
    bindir="$APT_DIR/dists/stable/main/binary-$arch"
    mkdir -p "$bindir"
    (cd "$APT_DIR" &&
        dpkg-scanpackages --arch "$arch" pool /dev/null > "dists/stable/main/binary-$arch/Packages")
    gzip -9kf "$bindir/Packages"
done

release_file="$APT_DIR/dists/stable/Release"
{
    echo "Origin: rslvd"
    echo "Label: rslvd-main"
    echo "Suite: stable"
    echo "Codename: stable"
    echo "Components: main"
    echo "Architectures: all $ARCHES"
    echo "Date: $(date -Ru)"
    echo "SHA256:"
    (cd "$APT_DIR/dists/stable" &&
        find main -type f -name "Packages*" | while read -r f; do
            printf ' %s %d %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$(stat -c%s "$f")" "$f"
        done)
} > "$release_file"

# Bootstrap archives generated against this repo. generate-bootstraps.sh needs
# the repo reachable over HTTP; serve the staging dir briefly on localhost.
mkdir -p "$RSLVD_REPO_DIR/bootstraps"
python3 -m http.server 8901 --directory "$RSLVD_REPO_DIR" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1

(cd "$TERMUX_PACKAGES_DIR" &&
    ./scripts/generate-bootstraps.sh \
        --architectures "$(echo "$ARCHES" | tr ' ' ',')" \
        --add netcat-openbsd,net-tools,dnsutils,nmap,rslvd-tunnel \
        -r "http://127.0.0.1:8901/apt/rslvd-main")

kill $SERVER_PID 2>/dev/null || true

for arch in $ARCHES; do
    zip="$TERMUX_PACKAGES_DIR/bootstrap-$arch.zip"
    [ -f "$zip" ] || zip="$(ls "$TERMUX_PACKAGES_DIR"/bootstrap-"$arch"*.zip | head -1)"
    cp "$zip" "$RSLVD_REPO_DIR/bootstraps/bootstrap-$arch.zip"
    (cd "$RSLVD_REPO_DIR/bootstraps" &&
        sha256sum "bootstrap-$arch.zip" > "bootstrap-$arch.zip.sha256")
done

echo "Repository staged at: $RSLVD_REPO_DIR"
echo "Deploy: rsync -av --delete '$RSLVD_REPO_DIR/' ubuntu@129.146.61.187:/opt/rslvd-repo/"
