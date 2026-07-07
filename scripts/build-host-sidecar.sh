#!/usr/bin/env bash
# ============================================================================
# Bun-compile the Houston single sidecar into a self-contained binary and stage
# it where `build.rs` picks it up for Tauri's `externalBin` bundling.
#
# ONE binary, TWO roles: the compiled `sidecar-entry.ts` runs as the local HOST
# by default, or as a pi RUNTIME when HOUSTON_SIDECAR_ROLE=runtime. The host
# spawns ITSELF (same binary) in runtime mode, so the packaged .app needs no
# `bun` and no repo source to launch a runtime — fixing the packaging gap where
# a source-run default (`node --import tsx <repo>/packages/runtime/src/main.ts`)
# could never resolve inside the .app.
#
# Every desktop build ships THIS binary as its one and only sidecar — the Tauri
# shell spawns it (see app/src-tauri/src/lib.rs `spawn_host_sidecar` +
# engine_supervisor::parse_banner for HOUSTON_HOST_LISTENING). Release builds
# hard-fail in build.rs if it hasn't been compiled first.
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

# --- Stamp the sidecar with the workspace git HEAD at compile time -----------
# `build.rs` reads this stamp for RELEASE builds and refuses to ship a sidecar
# whose stamp doesn't match the current HEAD — that catches a stale binary left
# over from a previous commit (e.g. a rebase) that would otherwise be bundled
# silently. The stamp lives next to the binary so it travels with it and is
# per-triple (so a cross-arch build stamps each slice independently).
STAMP="${OUT}.stamp"
GIT_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
if [ -z "$GIT_HEAD" ]; then
  echo "ERROR: could not resolve git HEAD to stamp the sidecar (a git checkout is required)." >&2
  exit 1
fi
printf '%s\n' "$GIT_HEAD" >"$STAMP"
echo "Stamped host sidecar with HEAD $GIT_HEAD -> $STAMP"

# --- Stage the Claude Code native binary next to the sidecar ------------------
# The Bun-compiled sidecar can't resolve the SDK's native `claude` binary at
# runtime (it lives outside Bun's $bunfs virtual FS — see
# packages/runtime/src/backends/claude/binary-path.ts). So we ship the platform
# `claude` binary as a SIBLING: build.rs stages it as the Tauri externalBin
# `binaries/claude-<triple>` (alongside `binaries/houston-engine-<triple>`), so
# both land in the same bundle dir (Contents/MacOS on macOS) and the macOS
# signing/notarization sweep signs it like any other bundled binary.
# resolveClaudeExecutable() then points the SDK at `<dir of sidecar>/claude`.
#
# The binary comes from the SDK's per-platform optional package in the pnpm
# store: @anthropic-ai/claude-agent-sdk-<os>-<arch> (glibc for linux; the
# desktop AppImage/deb are glibc). pnpm installs only the HOST-matching platform
# package, so a cross-target build (e.g. the macOS universal build compiling
# x86_64 on an arm64 runner) needs the non-native package force-installed first
# (`pnpm add -w @anthropic-ai/claude-agent-sdk-<os>-<arch>@<ver> --force`), the
# same requirement the SDK README documents for `bun build --compile`.
sdk_platform_slug() {
  local triple="$1" arch os
  case "$triple" in
    aarch64-*) arch="arm64" ;;
    x86_64-*) arch="x64" ;;
    *) echo "ERROR: unsupported triple arch in '$triple'" >&2; return 1 ;;
  esac
  case "$triple" in
    *-apple-darwin) os="darwin" ;;
    *-unknown-linux-gnu) os="linux" ;;
    *-pc-windows-msvc) os="win32" ;;
    *) echo "ERROR: unsupported triple OS in '$triple'" >&2; return 1 ;;
  esac
  echo "${os}-${arch}"
}

SDK_SLUG="$(sdk_platform_slug "$TRIPLE")"
CLAUDE_BIN_NAME="claude"
case "$TRIPLE" in *-pc-windows-msvc) CLAUDE_BIN_NAME="claude.exe" ;; esac

# Locate the binary in the pnpm store (deterministic layout). Newest match wins.
CLAUDE_SRC="$(
  ls -1 "$REPO_ROOT"/node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-"$SDK_SLUG"@*/node_modules/@anthropic-ai/claude-agent-sdk-"$SDK_SLUG"/"$CLAUDE_BIN_NAME" 2>/dev/null | tail -1 || true
)"

if [ -z "$CLAUDE_SRC" ] || [ ! -f "$CLAUDE_SRC" ]; then
  echo "ERROR: Claude Code binary for '$SDK_SLUG' not found in the pnpm store." >&2
  echo "       Install it before building the sidecar for this target:" >&2
  echo "       pnpm add -w @anthropic-ai/claude-agent-sdk-$SDK_SLUG@<version> --force" >&2
  exit 1
fi

CLAUDE_OUT="$OUT_DIR/claude-${TRIPLE}${EXT}"
cp "$CLAUDE_SRC" "$CLAUDE_OUT"
chmod +x "$CLAUDE_OUT"
CLAUDE_SIZE="$(du -h "$CLAUDE_OUT" | cut -f1)"
echo "Staged Claude Code binary: $CLAUDE_OUT ($CLAUDE_SIZE)"

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

# --- Verify the pi-ai model catalog route ------------------------------------
# The shipped host MUST serve `GET /v1/catalog` with a non-empty array — a host
# that predates the route 404s, which is exactly the staleness that shipped an
# empty model picker. `-f` makes curl fail the script on any non-200, so this
# also enforces HTTP 200.
echo "=== Verifying the compiled host serves /v1/catalog ==="
CATALOG="$(curl -fsS -H "Authorization: Bearer ${TOKEN}" "http://localhost:${PORT}/v1/catalog")"
echo "GET /v1/catalog → $(printf '%s' "$CATALOG" | head -c 120)…"

case "$CATALOG" in
  \[*) ;; # A JSON array, as the ProviderCatalog wire type requires.
  *) echo "ERROR: /v1/catalog did not return a JSON array" >&2; exit 1 ;;
esac
if [ "$(printf '%s' "$CATALOG" | tr -d '[:space:]')" = "[]" ]; then
  echo "ERROR: /v1/catalog returned an EMPTY array (no providers/models)" >&2
  exit 1
fi
echo "VERIFIED: host served a non-empty /v1/catalog"
