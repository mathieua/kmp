#!/usr/bin/env bash
# Builds an OTA release tarball + checksum. Run on the target architecture
# (arm64) so better-sqlite3 is compiled for Electron's ABI.
#   scripts/make-release.sh 1.2.3
# Then attach out/kmp-1.2.3.tar.gz and out/kmp-1.2.3.tar.gz.sha256 to a
# (non-draft, non-prerelease) GitHub release tagged v1.2.3; the release body
# becomes the changelog shown in the portal.
set -euo pipefail
VERSION="${1:?usage: make-release.sh <x.y.z>}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must be x.y.z" >&2; exit 1; }
cd "$(dirname "$0")/.."

npm ci
npm run build

OUT="$PWD/out"; STAGE="$(mktemp -d)"
mkdir -p "$OUT"
cp -r dist hw scripts migrations package.json package-lock.json node_modules "$STAGE/"
rm -rf "$STAGE/hw/pcb"
echo "$VERSION" > "$STAGE/VERSION"

TARBALL="$OUT/kmp-$VERSION.tar.gz"
tar -czf "$TARBALL" -C "$STAGE" .
(cd "$OUT" && sha256sum "kmp-$VERSION.tar.gz" > "kmp-$VERSION.tar.gz.sha256")
rm -rf "$STAGE"
echo "Built $TARBALL"; cat "$TARBALL.sha256"
