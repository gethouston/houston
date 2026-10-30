#!/usr/bin/env bash
# ============================================================================
# houston-doctor — pre-PR diagnostic snapshot of a contributor's environment.
#
# Run BEFORE opening a PR to confirm the local checkout, engine sidecar,
# ~/.houston/ state, and CLI-deps staging are in known-good shape. Read-only:
# never builds, fetches, or mutates. Exits 0 unless something is genuinely
# broken — STALE engine sidecars are WARN, not FAIL, because most
# contributors hit that mid-dev when the frontend HMRs faster than cargo.
#
# Section 1 is the explicit detector for the CLAUDE.md §"Engine sidecar
# staleness" footgun: `pnpm tauri dev` does NOT rebuild engine/ on its own,
# so the sidecar can be days stale while the frontend looks fresh —
# symptoms are 404s on routes that exist in the current source.
#
# Doctor is a snapshot, not a fixer. Whatever it surfaces, the contributor
# resolves with the next-command hint printed inline.
#
# Bash 3.2 (macOS default) — no associative arrays, no mapfile, no ${var,,}.
# Deps already in any Houston contributor's env: bash, jq, curl, du, find, git.
# ============================================================================
set -euo pipefail

# Deps precheck — fail early with an actionable install hint rather than
# crash mid-section with bash exit 127. Mirrors the precondition block in
# scripts/fetch-cli-deps.sh:81-84 so contributors get the same DX whichever
# script they invoke first.
for _cmd in jq curl find du git awk; do
  command -v "$_cmd" >/dev/null 2>&1 || {
    printf 'FAIL houston-doctor needs `%s` but it is missing from $PATH\n' "$_cmd" >&2
    printf '     install: brew install %s    (or the distro equivalent)\n' "$_cmd" >&2
    exit 1
  }
done
unset _cmd

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOUSTON_HOME="${HOUSTON_HOME:-$HOME/.houston}"

# Color discipline: ANSI only on a real tty so piped output (CI logs, files)
# stays plain-text grep-able. `test -t 1` is the POSIX-portable check.
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'
  C_DIM=$'\033[2m';  C_RST=$'\033[0m'
else
  C_RED=""; C_YEL=""; C_GRN=""; C_DIM=""; C_RST=""
fi

FAIL_COUNT=0
WARN_COUNT=0
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); printf '%sFAIL%s %s\n' "$C_RED" "$C_RST" "$1"; }
warn() { WARN_COUNT=$((WARN_COUNT + 1)); printf '%sWARN%s %s\n' "$C_YEL" "$C_RST" "$1"; }
ok()   { printf '%sOK%s   %s\n' "$C_GRN" "$C_RST" "$1"; }
info() { printf '     %s\n' "$1"; }
hdr()  { printf '\n=== %s ===\n' "$1"; }

# ---------------------------------------------------------------------------
# SECTION 1 — Engine sidecar staleness
#   CLAUDE.md §"Engine sidecar staleness" footgun: Tauri does NOT rebuild
#   engine/ on HMR, so a stale `target/release/houston-engine` will run
#   yesterday's sidecar against today's frontend. We compare mtimes via
#   `find -newer` (Bash 3.2-safe; no epoch arithmetic) and short-circuit
#   at the first newer source via `head -1` so this stays cheap on large
#   worktrees. Windows checkouts use `.exe`; missing binary is INFO, not
#   FAIL — fresh checkout before `cargo build` is the common case.
# ---------------------------------------------------------------------------
hdr "Engine sidecar"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ENGINE_BIN="$REPO_ROOT/target/release/houston-engine.exe" ;;
  *)                    ENGINE_BIN="$REPO_ROOT/target/release/houston-engine" ;;
esac
if [ ! -f "$ENGINE_BIN" ]; then
  info "no release sidecar at $ENGINE_BIN"
  info "fresh checkout? run: cargo build --release -p houston-engine-server"
else
  NEWER="$(find "$REPO_ROOT/engine" -name '*.rs' -type f -newer "$ENGINE_BIN" 2>/dev/null | head -1 || true)"
  if [ -n "$NEWER" ]; then
    warn "STALE sidecar — run \`cargo build --release -p houston-engine-server\`"
    info "newer source: ${NEWER#"$REPO_ROOT/"}"
    info "(CLAUDE.md §\"Engine sidecar staleness\" — dev-only footgun)"
  else
    ok "sidecar up-to-date relative to engine/**/*.rs"
  fi
fi

# ---------------------------------------------------------------------------
# SECTION 2 — ~/.houston/ state
#   Missing dir is fine (fresh dev machine that's never run `pnpm tauri dev`).
#   `du` failing on a *present* dir = perms/disk error and FAIL because the
#   engine can't run against an unreadable home. Sessions live deep:
#   ~/.houston/workspaces/<W>/<Agent>/.houston/sessions/<provider>/<id>.sid;
#   `-mtime -7` keeps the signal contributors care about (cold sessions
#   tell us nothing about whether the contributor's loop works).
# ---------------------------------------------------------------------------
hdr "~/.houston/ state"
if [ ! -d "$HOUSTON_HOME" ]; then
  info "no $HOUSTON_HOME — fresh machine, engine has never been started"
else
  if SIZE="$(du -sh "$HOUSTON_HOME" 2>/dev/null | cut -f1)"; then
    info "size:       $SIZE"
  else
    fail "cannot stat $HOUSTON_HOME (perms? unreadable?)"
  fi
  if [ -d "$HOUSTON_HOME/workspaces" ]; then
    WS_COUNT="$(find "$HOUSTON_HOME/workspaces" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
    info "workspaces: $WS_COUNT"
  else
    info "workspaces: 0 (no workspaces/ dir)"
  fi
  RECENT_SID="$(find "$HOUSTON_HOME" -name '*.sid' -type f -mtime -7 2>/dev/null | wc -l | tr -d ' ')"
  info "recent .sid (<=7d): $RECENT_SID"
  ok "~/.houston/ readable"
fi

# ---------------------------------------------------------------------------
# SECTION 3 — Engine HTTP probe
#   Engine binds 127.0.0.1:0 (random port) — see
#   engine/houston-engine-server/src/main.rs::write_manifest — and records
#   the chosen port in ~/.houston/engine.json. We read it from there rather
#   than hardcoding (8011/8080/etc. don't exist anywhere in the engine).
#   Every /v1/* route runs through bearer auth (auth::require_bearer in
#   engine/houston-engine-server/src/lib.rs); doctor doesn't carry the
#   token, so the *expected* "engine up" signal is 401 — that means the
#   auth layer ran, which means the engine is serving. 200 would only
#   happen if the contributor exported HOUSTON_ENGINE_TOKEN. Both prove
#   it's running. 1-second timeout because loopback is either there or
#   not. No engine = INFO (app is just closed).
# ---------------------------------------------------------------------------
hdr "Engine HTTP probe"
MANIFEST="$HOUSTON_HOME/engine.json"
if [ ! -f "$MANIFEST" ]; then
  info "no engine.json — engine has never started (or home was cleaned)"
elif ! ENGINE_PORT="$(jq -er '.port' "$MANIFEST" 2>/dev/null)"; then
  warn "engine.json present but unparseable (missing .port)"
else
  URL="http://127.0.0.1:$ENGINE_PORT/v1/health"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "$URL" 2>/dev/null || echo "000")"
  case "$CODE" in
    200) ok "engine running on :$ENGINE_PORT (token-authed, HTTP 200)" ;;
    401) ok "engine running on :$ENGINE_PORT (HTTP 401 from /v1/health is expected without HOUSTON_ENGINE_TOKEN)" ;;
    000) info "engine not running on :$ENGINE_PORT (no listener; fine if app is closed)" ;;
    *)   warn "engine on :$ENGINE_PORT returned HTTP $CODE — unexpected" ;;
  esac
fi

# ---------------------------------------------------------------------------
# SECTION 4 — CLI-deps pin summary
#   Dollar-prefix keys ($schema, $comment) are manifest metadata and excluded
#   — same `select(startswith("$") | not)` idiom bump-cli.sh uses.
#   Resources/bin/ empty is INFO, not FAIL: fresh checkouts haven't run
#   fetch-cli-deps.sh yet, and only `pnpm tauri build` (not `dev`) reads it.
# ---------------------------------------------------------------------------
hdr "CLI-deps pin summary"
DEPS="$REPO_ROOT/cli-deps.json"
BIN_DIR="$REPO_ROOT/app/src-tauri/resources/bin"
if [ ! -f "$DEPS" ]; then
  fail "cli-deps.json missing at $DEPS"
else
  jq -r 'to_entries[] | select(.key | startswith("$") | not) | "\(.key)\t\(.value.version // "?")"' \
    "$DEPS" | awk -F'\t' '{ printf "     %-14s %s\n", $1, $2 }'
  if [ -d "$BIN_DIR" ] && [ -n "$(ls -A "$BIN_DIR" 2>/dev/null)" ]; then
    STAGED="$(ls "$BIN_DIR" | tr '\n' ' ')"
    info "staged in resources/bin/: ${C_DIM}${STAGED}${C_RST}"
  else
    info "resources/bin/ empty — run ./scripts/fetch-cli-deps.sh host"
  fi
fi

# ---------------------------------------------------------------------------
# SECTION 5 — Git tree state
#   `git status -sb` summary, ahead/behind vs origin/main, capped list of
#   dirty files so massive in-progress refactors don't drown the report.
#   Detached HEAD is FAIL: CLAUDE.md §"Git — Worktree workflow" relies on
#   a named branch (claude/<worktree-name>) for the PR step; accidentally
#   detaching strands your work and breaks the commit/push/PR pipeline.
# ---------------------------------------------------------------------------
hdr "Git tree state"
if BRANCH="$(git -C "$REPO_ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null)"; then
  info "branch: $BRANCH"
else
  fail "detached HEAD — checkout your worktree branch before committing"
fi
if AHEAD_BEHIND="$(git -C "$REPO_ROOT" rev-list --left-right --count origin/main...HEAD 2>/dev/null)"; then
  BEHIND="$(printf '%s\n' "$AHEAD_BEHIND" | awk '{print $1}')"
  AHEAD="$(printf '%s\n' "$AHEAD_BEHIND" | awk '{print $2}')"
  info "ahead of origin/main: $AHEAD   behind: $BEHIND"
else
  info "ahead/behind unknown (origin/main not fetched?)"
fi
DIRTY="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
if [ "$DIRTY" -eq 0 ]; then
  ok "tree clean"
else
  info "uncommitted files: $DIRTY (showing first 10)"
  git -C "$REPO_ROOT" status --porcelain 2>/dev/null | head -10 | sed 's/^/       /'
fi

# ---------------------------------------------------------------------------
# SECTION 6 — Verdict
#   Exit 0 unless a FAIL fired. STALE sidecar is WARN only — half the dev
#   population would otherwise be blocked mid-flow.
# ---------------------------------------------------------------------------
hdr "Verdict"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf '%sFAIL%s — %d failure(s), %d warning(s). Fix the FAILs before opening a PR.\n' "$C_RED" "$C_RST" "$FAIL_COUNT" "$WARN_COUNT"
  exit 1
fi
if [ "$WARN_COUNT" -gt 0 ]; then
  printf '%sWARN%s — %d warning(s). Safe to open a PR; resolve warnings if related.\n' "$C_YEL" "$C_RST" "$WARN_COUNT"
else
  printf '%sPASS%s — all checks green.\n' "$C_GRN" "$C_RST"
fi
exit 0
