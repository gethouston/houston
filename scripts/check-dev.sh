#!/usr/bin/env bash
# scripts/check-dev.sh — Houston Windows dev environment checker + fixer.
#
# Checks (and optionally fixes) every prerequisite for `pnpm tauri dev`
# on Windows. Run once after cloning, and again after any major dep bump.
#
# Usage (from repo root):
#   bash scripts/check-dev.sh          # diagnose only — shows ✓/✗ per check
#   bash scripts/check-dev.sh --fix    # auto-fix everything it can
#
# Via pnpm (from app/):
#   pnpm check-dev
#   pnpm check-dev:fix

set -uo pipefail

# ── Locate repo root ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── Args ──────────────────────────────────────────────────────────────────────
FIX=false
for arg in "$@"; do [[ "$arg" == "--fix" ]] && FIX=true; done

# ── Colors (only when writing to a terminal) ──────────────────────────────────
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
  CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; DIM=''; RESET=''
fi

PASS="${GREEN}✓${RESET}"; FAIL="${RED}✗${RESET}"; WARN="${YELLOW}⚠${RESET}"

ERRORS=0   # checks currently failing (decremented when a fix succeeds)
FIXED=0    # successful fixes applied this run

NEEDS_CLI_STAGE=false

# ── Output helpers ────────────────────────────────────────────────────────────
section() { echo; echo "${BOLD}${CYAN}── $1${RESET}"; }
ok()      { echo "  ${PASS}  $1"; }
fail()    { echo "  ${FAIL}  $1"; ERRORS=$((ERRORS + 1)); }
warn()    { echo "  ${WARN}  $1"; }
hint()    { echo "      ${DIM}→ $1${RESET}"; }
doing()   { echo "      ${YELLOW}→ $1${RESET}"; }
fixed()   { echo "  ${PASS}  $1 ${DIM}(fixed)${RESET}"; ERRORS=$((ERRORS - 1)); FIXED=$((FIXED + 1)); }

# ── WinGet Links — tools land here immediately after winget install ───────────
LOCALAPPDATA_BASH="${LOCALAPPDATA:-$USERPROFILE/AppData/Local}"
WINGET_LINKS="$LOCALAPPDATA_BASH/Microsoft/WinGet/Links"
export PATH="$WINGET_LINKS:$PATH"

# ── Houston dev-tools cache (pinned Bun lives here) ──────────────────────────
HOUSTON_DEV_DIR="${USERPROFILE:-$HOME}/.houston-dev"

# ── Parse pinned Bun version from cli-deps.json (no jq needed yet) ───────────
DEPS_FILE="$REPO_ROOT/cli-deps.json"
PINNED_BUN="1.3.10"   # fallback in case parsing fails
if [[ -f "$DEPS_FILE" ]]; then
  _parsed=$(grep -A30 '"windows-x64"' "$DEPS_FILE" \
    | grep '"bun_version"' | head -1 \
    | sed 's/.*"bun_version": *"\([^"]*\)".*/\1/' 2>/dev/null || true)
  [[ -n "$_parsed" ]] && PINNED_BUN="$_parsed"
fi

# ── Helper: winget install ────────────────────────────────────────────────────
winget_install() {
  local id="$1" label="$2"
  if ! command -v winget >/dev/null 2>&1; then
    hint "winget not found — install $label manually"
    return 1
  fi
  doing "Installing $label via winget..."
  winget install --id "$id" -e \
      --accept-source-agreements --accept-package-agreements \
      --silent --disable-interactivity 2>&1 | tail -3
  export PATH="$WINGET_LINKS:$PATH"
}

# ── Helper: download pinned Bun to ~/.houston-dev/bun-<ver>/ ─────────────────
download_bun() {
  local version="$1"
  local dest="$HOUSTON_DEV_DIR/bun-${version}"
  local url="https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-windows-x64.zip"
  local zip
  zip="$(mktemp --suffix=.zip 2>/dev/null || echo "$HOUSTON_DEV_DIR/bun-${version}.zip")"

  mkdir -p "$dest"

  doing "Downloading bun v${version} from GitHub Releases..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$zip"
  else
    powershell -NoProfile -NonInteractive -Command \
      "Invoke-WebRequest -Uri '$url' -OutFile '$(cygpath -w "$zip" 2>/dev/null || echo "$zip")'"
  fi

  doing "Extracting to $dest ..."
  powershell -NoProfile -NonInteractive -Command \
    "Expand-Archive -Path '$(cygpath -w "$zip" 2>/dev/null || echo "$zip")' \
     -DestinationPath '$(cygpath -w "$dest" 2>/dev/null || echo "$dest")' -Force" 2>&1

  rm -f "$zip"

  # The zip contains bun-windows-x64/bun.exe — hoist to dest root
  local inner_exe
  inner_exe="$(find "$dest" -name "bun.exe" | head -1)"
  if [[ -z "$inner_exe" ]]; then
    hint "bun.exe not found in downloaded zip — download may be corrupt"
    return 1
  fi
  [[ "$(dirname "$inner_exe")" != "$dest" ]] && mv "$inner_exe" "$dest/bun.exe"
  # Remove the now-empty inner dir
  find "$dest" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} + 2>/dev/null || true

  export PATH="$dest:$PATH"
  return 0
}

# ── Pre-resolve Bun: dev-cache takes priority, then PATH ─────────────────────
BUN_FOUND=false
BUN_EXE=""
_bun_cached="$HOUSTON_DEV_DIR/bun-${PINNED_BUN}/bun.exe"
if [[ -x "$_bun_cached" ]]; then
  _v=$("$_bun_cached" --version 2>/dev/null || true)
  if [[ "$_v" == "$PINNED_BUN" ]]; then
    BUN_FOUND=true; BUN_EXE="$_bun_cached"
    export PATH="$HOUSTON_DEV_DIR/bun-${PINNED_BUN}:$PATH"
  fi
fi
if ! $BUN_FOUND && command -v bun >/dev/null 2>&1; then
  _v=$(bun --version 2>/dev/null || true)
  if [[ "$_v" == "$PINNED_BUN" ]]; then
    BUN_FOUND=true; BUN_EXE="$(command -v bun)"
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
echo
echo "${BOLD}Houston dev environment check${RESET}  ${DIM}repo: $REPO_ROOT${RESET}"
$FIX && echo "${YELLOW}--fix mode: issues will be corrected where possible${RESET}" || true
# ═════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
section "1 / 4  Required tools"
# ─────────────────────────────────────────────────────────────────────────────

# git ──────────────────────────────────────────────────────────────────────────
if command -v git >/dev/null 2>&1; then
  ok "git $(git --version | awk '{print $3}')"
else
  fail "git not found"
  if $FIX; then
    winget_install Git.Git "Git" && command -v git >/dev/null 2>&1 \
      && fixed "git $(git --version | awk '{print $3}')" \
      || hint "Restart your shell and re-run check-dev.sh --fix"
  else
    hint "winget install --id Git.Git -e"
  fi
fi

# cargo / Rust ─────────────────────────────────────────────────────────────────
if command -v cargo >/dev/null 2>&1; then
  ok "cargo (Rust) $(cargo --version 2>/dev/null | awk '{print $2}')"
else
  fail "cargo (Rust) not found — engine and app require it"
  hint "Install Rust: https://rustup.rs  or  winget install Rustlang.Rustup"
  hint "After install, restart your shell and re-run this script"
fi

# pnpm ─────────────────────────────────────────────────────────────────────────
if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm $(pnpm --version)"
else
  fail "pnpm not found"
  if $FIX; then
    doing "npm install -g pnpm ..."
    npm install -g pnpm 2>&1 | tail -2 \
      && command -v pnpm >/dev/null 2>&1 \
      && fixed "pnpm $(pnpm --version)" \
      || hint "npm install -g pnpm  (then restart shell)"
  else
    hint "npm install -g pnpm"
  fi
fi

# jq ───────────────────────────────────────────────────────────────────────────
if command -v jq >/dev/null 2>&1; then
  ok "jq $(jq --version)"
else
  fail "jq not found (needed by fetch-cli-deps.sh)"
  if $FIX; then
    winget_install jqlang.jq "jq" \
      && command -v jq >/dev/null 2>&1 \
      && fixed "jq $(jq --version)" \
      || hint "Restart shell and re-run check-dev.sh --fix"
  else
    hint "winget install --id jqlang.jq -e"
  fi
fi

# zstd ─────────────────────────────────────────────────────────────────────────
if command -v zstd >/dev/null 2>&1; then
  ok "zstd $(zstd --version 2>&1 | head -1 | grep -oE 'v[0-9.]+')"
else
  fail "zstd not found (needed to decompress codex.exe.zst)"
  if $FIX; then
    winget_install Meta.Zstandard "Zstandard" \
      && command -v zstd >/dev/null 2>&1 \
      && fixed "zstd $(zstd --version 2>&1 | head -1 | grep -oE 'v[0-9.]+')" \
      || hint "Restart shell and re-run check-dev.sh --fix"
  else
    hint "winget install --id Meta.Zstandard -e"
  fi
fi

# bun (pinned version for composio fork build) ────────────────────────────────
if $BUN_FOUND; then
  ok "bun $PINNED_BUN  ${DIM}($BUN_EXE)${RESET}"
else
  if command -v bun >/dev/null 2>&1; then
    _v=$(bun --version 2>/dev/null || echo "?")
    warn "bun $_v on PATH but composio build needs exactly $PINNED_BUN"
    hint "Running --fix will download bun $PINNED_BUN to ~/.houston-dev/ without touching your system bun"
    ERRORS=$((ERRORS + 1))
  else
    fail "bun not found (needed to build composio from the gethouston fork)"
  fi
  if $FIX; then
    download_bun "$PINNED_BUN" \
      && BUN_FOUND=true \
      && BUN_EXE="$HOUSTON_DEV_DIR/bun-${PINNED_BUN}/bun.exe" \
      && fixed "bun $PINNED_BUN  ($BUN_EXE)" \
      || hint "bun download failed — check your internet connection"
  else
    hint "bash scripts/check-dev.sh --fix  (downloads bun $PINNED_BUN to ~/.houston-dev/)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "2 / 4  Engine sidecar binary"
# ─────────────────────────────────────────────────────────────────────────────

# tauri dev stages the sidecar from target/{debug,release}/houston-engine.exe
_engine_found=""
for _candidate in \
    "$REPO_ROOT/target/debug/houston-engine.exe" \
    "$REPO_ROOT/target/x86_64-pc-windows-msvc/debug/houston-engine.exe" \
    "$REPO_ROOT/target/release/houston-engine.exe" \
    "$REPO_ROOT/target/x86_64-pc-windows-msvc/release/houston-engine.exe"; do
  [[ -f "$_candidate" ]] && { _engine_found="$_candidate"; break; }
done

if [[ -n "$_engine_found" ]]; then
  _age_h=$(( ($(date +%s) - $(date -r "$_engine_found" +%s 2>/dev/null || echo 0)) / 3600 ))
  _size=$(wc -c < "$_engine_found" | awk '{printf "%.0f MB", $1/1048576}')
  ok "houston-engine.exe  ${DIM}(${_age_h}h old, ${_size})${RESET}"
  # Warn if the staged binaries/ copy is missing or older than the source
  _sidecar="$REPO_ROOT/app/src-tauri/binaries/houston-engine-x86_64-pc-windows-msvc.exe"
  if [[ ! -f "$_sidecar" ]]; then
    warn "binaries/houston-engine-x86_64-pc-windows-msvc.exe is missing"
    hint "It will be staged automatically when tauri dev compiles"
  fi
else
  fail "houston-engine.exe not built — tauri dev will abort at sidecar staging"
  if $FIX; then
    doing "cargo build -p houston-engine-server  (this takes a few minutes)..."
    if cargo build -p houston-engine-server; then
      fixed "houston-engine.exe built"
    else
      hint "cargo build -p houston-engine-server failed — check Rust errors above"
    fi
  else
    hint "cargo build -p houston-engine-server"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3 / 4  Staged CLI deps  (app/src-tauri/resources/bin/)"
# ─────────────────────────────────────────────────────────────────────────────

BIN_DIR="$REPO_ROOT/app/src-tauri/resources/bin"

_check_cli() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    local _size
    _size=$(wc -c < "$path" | awk '{printf "%.0f MB", $1/1048576}')
    ok "$label  ${DIM}(${_size})${RESET}"
  else
    fail "$label not staged"
    NEEDS_CLI_STAGE=true
  fi
}

_check_cli "composio-x86_64/composio.exe"   "$BIN_DIR/composio-x86_64/composio.exe"
_check_cli "codex.exe"                        "$BIN_DIR/codex.exe"
_check_cli "git-bash-x86_64.7z.exe"          "$BIN_DIR/git-bash-x86_64.7z.exe"

if $NEEDS_CLI_STAGE; then
  if $FIX; then
    # All three tools must be available before we can run the build
    _missing_tools=""
    command -v jq    >/dev/null 2>&1 || _missing_tools="$_missing_tools jq"
    command -v zstd  >/dev/null 2>&1 || _missing_tools="$_missing_tools zstd"
    $BUN_FOUND                       || _missing_tools="$_missing_tools bun@${PINNED_BUN}"

    if [[ -n "$_missing_tools" ]]; then
      warn "Cannot stage CLI deps — still missing:$_missing_tools"
      hint "Fix those first (see section 1) and re-run check-dev.sh --fix"
    else
      # Ensure pinned bun is first on PATH for the build
      $BUN_FOUND && export PATH="$(dirname "$BUN_EXE"):$PATH" || true
      doing "Running fetch-cli-deps.sh windows-x64 ..."
      doing "(First run: clones composio fork + Bun build — ~10 minutes)"
      if bash "$REPO_ROOT/scripts/fetch-cli-deps.sh" windows-x64; then
        FIXED=$((FIXED + 1))
        # Recalculate ERRORS for the CLI checks that were failing
        [[ -f "$BIN_DIR/composio-x86_64/composio.exe" ]] && ERRORS=$((ERRORS - 1)) || true
        [[ -f "$BIN_DIR/codex.exe"                     ]] && ERRORS=$((ERRORS - 1)) || true
        [[ -f "$BIN_DIR/git-bash-x86_64.7z.exe"        ]] && ERRORS=$((ERRORS - 1)) || true
        ok "CLI deps staged successfully"
      else
        hint "fetch-cli-deps.sh failed — check output above"
      fi
    fi
  else
    hint "Fix: bash scripts/check-dev.sh --fix"
    hint "     (installs jq + zstd + bun $PINNED_BUN if needed, then runs fetch-cli-deps.sh)"
    hint "     First run takes ~10 min (composio builds from source)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "4 / 4  Dev port 1420 (Vite)"
# ─────────────────────────────────────────────────────────────────────────────

_port_pid=$(netstat -ano 2>/dev/null \
  | grep -E ":1420\s" | grep -i listening \
  | awk '{print $NF}' | head -1 || true)

if [[ -z "$_port_pid" ]]; then
  ok "Port 1420 is free"
else
  _proc=$(powershell -NoProfile -NonInteractive -Command \
    "(Get-Process -Id $_port_pid -ErrorAction SilentlyContinue).ProcessName" \
    2>/dev/null | tr -d '\r' || echo "unknown")
  warn "Port 1420 in use by ${_proc} (PID ${_port_pid}) — tauri dev will fail to start Vite"
  if $FIX; then
    doing "Killing PID $_port_pid ($_proc) ..."
    powershell -NoProfile -NonInteractive -Command \
      "Stop-Process -Id $_port_pid -Force -ErrorAction SilentlyContinue" 2>&1 | tail -1
    fixed "Port 1420 freed"
  else
    hint "powershell -Command \"Stop-Process -Id $_port_pid -Force\""
    hint "OR: bash scripts/check-dev.sh --fix"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
echo
echo "${DIM}─────────────────────────────────────────────────────────────────${RESET}"

if [[ $ERRORS -eq 0 && $FIXED -eq 0 ]]; then
  echo "${GREEN}${BOLD}All checks passed.${RESET}  Ready to run:"
  echo "    cd app && pnpm tauri dev"
elif [[ $ERRORS -eq 0 && $FIXED -gt 0 ]]; then
  echo "${GREEN}${BOLD}All fixed! ($FIXED fix(es) applied)${RESET}  Ready to run:"
  echo "    cd app && pnpm tauri dev"
elif $FIX && [[ $FIXED -gt 0 ]]; then
  echo "${YELLOW}${BOLD}$FIXED fix(es) applied, $ERRORS issue(s) still need attention.${RESET}"
  echo "  Some fixes require a shell restart (PATH changes from winget)."
  echo "  Re-run:  bash scripts/check-dev.sh --fix"
else
  echo "${RED}${BOLD}$ERRORS issue(s) found.${RESET}"
  echo "  Auto-fix:  bash scripts/check-dev.sh --fix"
  echo "  Note: --fix skips nothing — it installs tools, builds the engine,"
  echo "  and runs fetch-cli-deps.sh (composio build ~10 min on first run)."
fi

echo "${DIM}─────────────────────────────────────────────────────────────────${RESET}"

exit $ERRORS
