#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTRY="$REPO_ROOT/packages/host/src/sidecar-entry.ts"
OUT_DIR="$REPO_ROOT/target/host-sidecar"

command -v bun >/dev/null 2>&1 || { echo "ERROR: bun not found on PATH" >&2; exit 1; }
test -f "$ENTRY" || { echo "ERROR: sidecar entry missing: $ENTRY" >&2; exit 1; }

EXPLICIT_TRIPLE=""
VERIFY=""
for arg in "$@"; do
  case "$arg" in
    --verify) VERIFY=1 ;;
    -*) echo "ERROR: unknown flag $arg" >&2; exit 1 ;;
    *) EXPLICIT_TRIPLE="$arg" ;;
  esac
done

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
bun build --compile --sourcemap --target="$BUN_TARGET" \
  --external chromium-bidi \
  "$ENTRY" --outfile "$OUT"
chmod +x "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "Built host sidecar: $OUT ($SIZE)"

STAMP="${OUT}.stamp"
GIT_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
if [ -z "$GIT_HEAD" ]; then
  echo "ERROR: could not resolve git HEAD to stamp the sidecar (a git checkout is required)." >&2
  exit 1
fi
printf '%s\n' "$GIT_HEAD" >"$STAMP"
echo "Stamped host sidecar with HEAD $GIT_HEAD -> $STAMP"

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

case "$RESP" in
  *'"profile":"local"'*) echo "VERIFIED: host served /v1/capabilities (profile=local)" ;;
  *) echo "ERROR: unexpected /v1/capabilities response" >&2; exit 1 ;;
esac

echo "=== Verifying the compiled host serves /v1/catalog ==="
CATALOG="$(curl -fsS -H "Authorization: Bearer ${TOKEN}" "http://localhost:${PORT}/v1/catalog")"
echo "GET /v1/catalog → $(printf '%s' "$CATALOG" | head -c 120)…"

case "$CATALOG" in
  \[*) ;;
  *) echo "ERROR: /v1/catalog did not return a JSON array" >&2; exit 1 ;;
esac
if [ "$(printf '%s' "$CATALOG" | tr -d '[:space:]')" = "[]" ]; then
  echo "ERROR: /v1/catalog returned an EMPTY array (no providers/models)" >&2
  exit 1
fi
echo "VERIFIED: host served a non-empty /v1/catalog"

echo "=== Verifying the compiled host carries the assistant operation catalog ==="
ASSISTANT_LINE="$(grep -m1 '\[assistant\] operation catalog:' "$LOG" || true)"
if [ -z "$ASSISTANT_LINE" ]; then
  echo "ERROR: the host booted with no embedded assistant operation catalog:" >&2
  grep -i assistant "$LOG" >&2 || true
  echo "       Run \`pnpm gen:assistant-catalog\` and rebuild the sidecar." >&2
  exit 1
fi
echo "VERIFIED: $ASSISTANT_LINE"
