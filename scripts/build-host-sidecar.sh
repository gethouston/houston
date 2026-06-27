#!/usr/bin/env bash
# ============================================================================
# Bun-compile the Houston single sidecar into a self-contained binary and stage
# it where `build.rs` (under the `host-sidecar` cargo feature) picks it up for
# Tauri's `externalBin` bundling.
#
# ONE binary, TWO roles: the compiled `sidecar-entry.ts` runs as the local HOST
# by default, or as a pi RUNTIME when HOUSTON_SIDECAR_ROLE=runtime. The host
# spawns ITSELF (same binary) in runtime mode, so the packaged .app needs no
# `bun` and no repo source to launch a runtime — fixing the packaging gap where
# a source-run default (`node --import tsx <repo>/packages/runtime/src/main.ts`)
# could never resolve inside the .app.
#
# This is the host-sidecar analogue of the release workflow's
# `cargo build -p houston-engine-server` step: the desktop's default build
# still ships the Rust engine; a `--features host-sidecar` build ships THIS
# binary instead and the Tauri shell spawns it (see app/src-tauri/src/lib.rs
# `host_sidecar` path + engine_supervisor::parse_banner for HOUSTON_HOST_LISTENING).
#
# Output:
#   target/host-sidecar/houston-host-<rust-triple>            (macOS / Linux)
#   target/host-sidecar/houston-host-<rust-triple>.exe        (Windows)
#
# The <rust-triple> matches Tauri's `externalBin` suffix convention so the
# build.rs stager can rename it to `binaries/houston-engine-<triple>` — the
# same name the Rust engine uses, which keeps tauri.conf.json untouched.
#
# Usage:
#   scripts/build-host-sidecar.sh                         # current host, compile only
#   scripts/build-host-sidecar.sh --verify                # current host, then boot + curl
#   scripts/build-host-sidecar.sh <rust-triple>           # an explicit target (CI)
#   scripts/build-host-sidecar.sh <rust-triple> --verify  # explicit target, then boot + curl
#
# An explicit <rust-triple> (e.g. x86_64-unknown-linux-gnu, aarch64-apple-darwin,
# x86_64-pc-windows-msvc) lets CI build each target with the SAME script the local
# build uses — no second bun-compile invocation to drift. Bun links its own libc,
# so same-OS cross-arch works (this is how the macOS universal build compiles BOTH
# arches on one runner); each CI runner still builds its own OS. --verify only
# makes sense for a host-native target (it boots the binary).
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The dual-role dispatch entry (host by default, runtime via HOUSTON_SIDECAR_ROLE).
ENTRY="$REPO_ROOT/packages/host/src/sidecar-entry.ts"
OUT_DIR="$REPO_ROOT/target/host-sidecar"

command -v bun >/dev/null 2>&1 || { echo "ERROR: bun not found on PATH" >&2; exit 1; }
test -f "$ENTRY" || { echo "ERROR: sidecar entry missing: $ENTRY" >&2; exit 1; }

# Args: an optional explicit <rust-triple> and/or --verify, in any order.
EXPLICIT_TRIPLE=""
VERIFY=""
for arg in "$@"; do
  case "$arg" in
    --verify) VERIFY=1 ;;
    -*) echo "ERROR: unknown flag $arg" >&2; exit 1 ;;
    *) EXPLICIT_TRIPLE="$arg" ;;
  esac
done

# Derive the Rust target triple for the current host. These match the suffixes
# tauri-cli appends to `externalBin` names, so the staged binary lines up with
# `binaries/houston-engine-<triple>`.
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

# The matching Bun --target for a Rust triple (Bun only needs OS+arch; it links
# its own libc). One source — the resolved TRIPLE — drives both the output name
# and the bun target, whether the triple was given or derived from the host.
bun_target_for() {
  local triple="$1" arch os
  case "$triple" in
    aarch64-*) arch="arm64" ;;
    x86_64-*) arch="x64" ;;
    *) echo "ERROR: unsupported triple arch in '$triple'" >&2; exit 1 ;;
  esac
  case "$triple" in
    *-apple-darwin) os="darwin" ;;
    *-unknown-linux-gnu) os="linux" ;;
    *-pc-windows-msvc) os="windows" ;;
    *) echo "ERROR: unsupported triple OS in '$triple'" >&2; exit 1 ;;
  esac
  echo "bun-${os}-${arch}"
}

TRIPLE="${EXPLICIT_TRIPLE:-$(host_triple)}"
BUN_TARGET="$(bun_target_for "$TRIPLE")"

EXT=""
case "$TRIPLE" in
  *-pc-windows-msvc) EXT=".exe" ;;
esac

OUT="$OUT_DIR/houston-host-${TRIPLE}${EXT}"

mkdir -p "$OUT_DIR"
echo "=== bun build --compile ($BUN_TARGET) → $OUT ==="
bun build --compile --target="$BUN_TARGET" "$ENTRY" --outfile "$OUT"
chmod +x "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "Built host sidecar: $OUT ($SIZE)"

if [ -z "$VERIFY" ]; then
  exit 0
fi

# --- Verify: boot the binary, wait for the banner, curl /v1/capabilities -----
echo "=== Verifying the compiled host serves /v1/capabilities ==="
TEST_ROOT="${HOME}/.houston-sidecar-test"
PORT="${HOUSTON_HOST_PORT:-8090}"
TOKEN="${HOUSTON_HOST_TOKEN:-t1}"
LOG="$(mktemp)"

HOUSTON_WORKSPACES_ROOT="$TEST_ROOT/workspaces" \
HOUSTON_CREDENTIALS_PATH="$TEST_ROOT/credentials.json" \
HOUSTON_HOST_PORT="$PORT" \
HOUSTON_HOST_TOKEN="$TOKEN" \
  "$OUT" >"$LOG" 2>&1 &
HOST_PID=$!

cleanup() {
  kill "$HOST_PID" 2>/dev/null || true
  wait "$HOST_PID" 2>/dev/null || true
  rm -f "$LOG"
}
trap cleanup EXIT

# Wait up to 20s for the HOUSTON_HOST_LISTENING banner.
for _ in $(seq 1 200); do
  if grep -q "HOUSTON_HOST_LISTENING" "$LOG" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$HOST_PID" 2>/dev/null; then
    echo "ERROR: host exited before emitting banner:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 0.1
done

if ! grep -q "HOUSTON_HOST_LISTENING" "$LOG" 2>/dev/null; then
  echo "ERROR: host did not emit HOUSTON_HOST_LISTENING within 20s:" >&2
  cat "$LOG" >&2
  exit 1
fi

echo "Banner: $(grep HOUSTON_HOST_LISTENING "$LOG" | head -1)"

RESP="$(curl -fsS -H "Authorization: Bearer ${TOKEN}" "http://localhost:${PORT}/v1/capabilities")"
echo "GET /v1/capabilities → $RESP"

# A minimal shape check: the local profile must report profile=local.
case "$RESP" in
  *'"profile":"local"'*) echo "VERIFIED: host served /v1/capabilities (profile=local)" ;;
  *) echo "ERROR: unexpected /v1/capabilities response" >&2; exit 1 ;;
esac
