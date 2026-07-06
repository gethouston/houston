#!/usr/bin/env bash
# ============================================================================
# Fetch the fatedier/frp client (frpc) release binary for a target platform and
# stage it where `app/src-tauri/build.rs` (`stage_frpc_sidecar`) picks it up for
# Tauri's `externalBin` bundling as `binaries/frpc-<triple>`.
#
# frpc is the tunnel client the desktop local-model bridge spawns
# (app/src-tauri/src/local_bridge/frpc.rs) to publish the loopback auth proxy at
# https://<subdomain>.tunnels.gethouston.ai. frp is Apache-2.0.
#
# The download is SHA256-verified against the release's
# `frp_sha256_checksums.txt`, and only the `frpc` binary is extracted (frps,
# configs, and LICENSE are discarded).
#
# Output:
#   target/frpc/frpc-<rust-triple>          (macOS / Linux)
#   target/frpc/frpc-<rust-triple>.exe      (Windows)
#
# Usage:
#   scripts/fetch-frpc.sh                    # current host triple
#   scripts/fetch-frpc.sh <rust-triple>      # an explicit target (CI, per-arch)
#
# Supported <rust-triple>:
#   aarch64-apple-darwin, x86_64-apple-darwin,
#   x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu,
#   x86_64-pc-windows-msvc, aarch64-pc-windows-msvc
#
# Override the frp version with FRP_VERSION (default below).
# ============================================================================
set -euo pipefail

FRP_VERSION="${FRP_VERSION:-0.69.0}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/target/frpc"

# Derive the Rust target triple for the current host (matches the suffix
# tauri-cli appends to `externalBin` names).
host_triple() {
  local arch os
  case "$(uname -m)" in
    arm64 | aarch64) arch="aarch64" ;;
    x86_64 | amd64) arch="x86_64" ;;
    *) echo "ERROR: unsupported host arch $(uname -m)" >&2; exit 1 ;;
  esac
  case "$(uname -s)" in
    Darwin) os="apple-darwin" ;;
    Linux) os="unknown-linux-gnu" ;;
    MINGW* | MSYS* | CYGWIN*) os="pc-windows-msvc" ;;
    *) echo "ERROR: unsupported host OS $(uname -s)" >&2; exit 1 ;;
  esac
  echo "${arch}-${os}"
}

TRIPLE="${1:-$(host_triple)}"

# Map a Rust triple to the frp release asset's OS/arch tokens, archive
# extension, and the frpc binary name inside the archive.
case "$TRIPLE" in
  aarch64-apple-darwin)       FRP_OS="darwin";  FRP_ARCH="arm64"; ARCHIVE_EXT="tar.gz"; BIN="frpc" ;;
  x86_64-apple-darwin)        FRP_OS="darwin";  FRP_ARCH="amd64"; ARCHIVE_EXT="tar.gz"; BIN="frpc" ;;
  x86_64-unknown-linux-gnu)   FRP_OS="linux";   FRP_ARCH="amd64"; ARCHIVE_EXT="tar.gz"; BIN="frpc" ;;
  aarch64-unknown-linux-gnu)  FRP_OS="linux";   FRP_ARCH="arm64"; ARCHIVE_EXT="tar.gz"; BIN="frpc" ;;
  x86_64-pc-windows-msvc)     FRP_OS="windows"; FRP_ARCH="amd64"; ARCHIVE_EXT="zip";    BIN="frpc.exe" ;;
  aarch64-pc-windows-msvc)    FRP_OS="windows"; FRP_ARCH="arm64"; ARCHIVE_EXT="zip";    BIN="frpc.exe" ;;
  *) echo "ERROR: unsupported triple '$TRIPLE'" >&2; exit 1 ;;
esac

ASSET="frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}.${ARCHIVE_EXT}"
INNER_DIR="frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}"
BASE_URL="https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}"
CHECKSUMS="frp_sha256_checksums.txt"

DEST_EXT=""
[ "$FRP_OS" = "windows" ] && DEST_EXT=".exe"
DEST="$OUT_DIR/frpc-${TRIPLE}${DEST_EXT}"

echo "frp v${FRP_VERSION} · ${TRIPLE} → ${ASSET}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "  downloading asset + checksums…"
curl -fsSL "${BASE_URL}/${ASSET}" -o "$TMP/$ASSET"
curl -fsSL "${BASE_URL}/${CHECKSUMS}" -o "$TMP/$CHECKSUMS"

# Verify SHA256 against the release checksums file.
EXPECTED="$(grep " ${ASSET}\$" "$TMP/$CHECKSUMS" | awk '{print $1}')"
if [ -z "$EXPECTED" ]; then
  echo "ERROR: no checksum for ${ASSET} in ${CHECKSUMS}" >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TMP/$ASSET" | awk '{print $1}')"
else
  ACTUAL="$(shasum -a 256 "$TMP/$ASSET" | awk '{print $1}')"
fi
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "ERROR: SHA256 mismatch for ${ASSET}" >&2
  echo "  expected: $EXPECTED" >&2
  echo "  actual:   $ACTUAL" >&2
  exit 1
fi
echo "  sha256 OK"

# Extract only the frpc binary.
echo "  extracting ${BIN}…"
if [ "$ARCHIVE_EXT" = "zip" ]; then
  unzip -q -o "$TMP/$ASSET" "${INNER_DIR}/${BIN}" -d "$TMP"
else
  tar -xzf "$TMP/$ASSET" -C "$TMP" "${INNER_DIR}/${BIN}"
fi

mkdir -p "$OUT_DIR"
cp "$TMP/${INNER_DIR}/${BIN}" "$DEST"
chmod 0755 "$DEST"

echo "  staged → ${DEST}"
echo "Done. build.rs will copy this into app/src-tauri/binaries/frpc-${TRIPLE}${DEST_EXT}."
