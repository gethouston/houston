#!/usr/bin/env bash
# ============================================================================
# Build the fatedier/frp client (frpc) FROM SOURCE for a target platform and
# stage it where `app/src-tauri/build.rs` (`stage_frpc_sidecar`) picks it up for
# Tauri's `externalBin` bundling as `binaries/frpc-<triple>`.
#
# frpc is the tunnel client the desktop local-model bridge spawns
# (app/src-tauri/src/local_bridge/frpc.rs) to publish the loopback auth proxy at
# https://<subdomain>.tunnels.gethouston.ai. frp is Apache-2.0.
#
# Why build from source instead of downloading the release binary (HOU-1170):
# frp is widely abused by malware as a C2 tunnel, so the STOCK upstream release
# binaries sit on antivirus blocklists — Avira quarantined a bundled frpc.exe
# out of a user's Program Files as "TR/W64.Malware". Our own build ships
# different bytes than the blocklisted upstream artifacts, keeps Go symbols
# (upstream strips with `-s -w`; stripped Go binaries score WORSE with AV
# heuristics), and on Windows gets Authenticode-signed together with the rest
# of the bundle by tauri-bundler's sidecar signing.
#
# Supply chain: the shallow tag clone is verified against the pinned FRP_COMMIT
# (the commit the release tag points to) before building — this replaces the
# old sha256 check on the upstream release archive. Overriding FRP_VERSION
# requires overriding FRP_COMMIT with it, or the script fails closed.
#
# Requires: git + any Go toolchain >= 1.21 on PATH (GOTOOLCHAIN=auto, Go's
# default, downloads the exact toolchain frp's go.mod demands). CGO is off, so
# ANY host can cross-compile ANY supported target.
#
# Output:
#   target/frpc/frpc-<rust-triple>          (macOS / Linux)
#   target/frpc/frpc-<rust-triple>.exe      (Windows)
#
# Usage:
#   scripts/build-frpc.sh                    # current host triple
#   scripts/build-frpc.sh <rust-triple>      # an explicit target (CI, per-arch)
#
# Supported <rust-triple>:
#   aarch64-apple-darwin, x86_64-apple-darwin,
#   x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu,
#   x86_64-pc-windows-msvc, aarch64-pc-windows-msvc
# ============================================================================
set -euo pipefail

# Pinned to the relay's frp version (see knowledge-base/local-models.md).
# DEFAULT_FRP_COMMIT is the commit tag v<DEFAULT_FRP_VERSION> points to.
DEFAULT_FRP_VERSION="0.69.0"
DEFAULT_FRP_COMMIT="c8c1e5116cdeb0f8edf51aab946917c6ce9dae14"

FRP_VERSION="${FRP_VERSION:-$DEFAULT_FRP_VERSION}"
if [ -z "${FRP_COMMIT:-}" ]; then
  if [ "$FRP_VERSION" != "$DEFAULT_FRP_VERSION" ]; then
    echo "ERROR: FRP_VERSION overridden to ${FRP_VERSION} without FRP_COMMIT." >&2
    echo "  Set FRP_COMMIT to the commit tag v${FRP_VERSION} points to (keeps the supply-chain pin meaningful)." >&2
    exit 1
  fi
  FRP_COMMIT="$DEFAULT_FRP_COMMIT"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/target/frpc"

command -v git >/dev/null 2>&1 || { echo "ERROR: git not found on PATH" >&2; exit 1; }
command -v go >/dev/null 2>&1 || {
  echo "ERROR: go not found on PATH — building frpc from source needs a Go toolchain (brew install go / https://go.dev/dl)" >&2
  exit 1
}

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

# Map a Rust triple to Go's GOOS/GOARCH.
case "$TRIPLE" in
  aarch64-apple-darwin)       GOOS="darwin";  GOARCH="arm64" ;;
  x86_64-apple-darwin)        GOOS="darwin";  GOARCH="amd64" ;;
  x86_64-unknown-linux-gnu)   GOOS="linux";   GOARCH="amd64" ;;
  aarch64-unknown-linux-gnu)  GOOS="linux";   GOARCH="arm64" ;;
  x86_64-pc-windows-msvc)     GOOS="windows"; GOARCH="amd64" ;;
  aarch64-pc-windows-msvc)    GOOS="windows"; GOARCH="arm64" ;;
  *) echo "ERROR: unsupported triple '$TRIPLE'" >&2; exit 1 ;;
esac

DEST_EXT=""
[ "$GOOS" = "windows" ] && DEST_EXT=".exe"
DEST="$OUT_DIR/frpc-${TRIPLE}${DEST_EXT}"

echo "frp v${FRP_VERSION} (${FRP_COMMIT}) · ${TRIPLE} → build from source"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "  cloning fatedier/frp @ v${FRP_VERSION}…"
git clone --quiet --depth 1 --branch "v${FRP_VERSION}" \
  https://github.com/fatedier/frp.git "$TMP/frp"

# Verify the checkout is exactly the pinned commit before building anything.
HEAD_COMMIT="$(git -C "$TMP/frp" rev-parse HEAD)"
if [ "$HEAD_COMMIT" != "$FRP_COMMIT" ]; then
  echo "ERROR: tag v${FRP_VERSION} resolved to unexpected commit" >&2
  echo "  expected: $FRP_COMMIT" >&2
  echo "  actual:   $HEAD_COMMIT" >&2
  exit 1
fi
echo "  commit pin OK"

# `-trimpath` drops build-machine paths; deliberately NO `-s -w` (see header).
# `-tags noweb` skips frpc's embedded admin dashboard: Houston never configures
# frpc's webServer (see local_bridge/frpc.rs render_config), and the assets are
# npm-built artifacts absent from the source tree (upstream's Makefile flips
# the same tag when web/frpc/dist is missing).
# frp hardcodes its version in pkg/util/version, so `frpc -v` stays correct.
echo "  go build (GOOS=$GOOS GOARCH=$GOARCH)…"
(
  cd "$TMP/frp"
  CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
    go build -trimpath -tags noweb -o "$TMP/frpc${DEST_EXT}" ./cmd/frpc
)

mkdir -p "$OUT_DIR"
cp "$TMP/frpc${DEST_EXT}" "$DEST"
chmod 0755 "$DEST"

echo "  staged → ${DEST}"
echo "Done. build.rs will copy this into app/src-tauri/binaries/frpc-${TRIPLE}${DEST_EXT}."
