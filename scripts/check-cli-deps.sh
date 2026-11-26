#!/usr/bin/env bash
# ============================================================================
# Report drift between `cli-deps.json` pinned versions and the latest
# upstream GitHub releases. This is the pre-bump scout for `bump-cli.sh`:
# run this first to decide whether a bump is worth doing, then `bump-cli.sh`
# + `fetch-cli-deps.sh` to actually execute the bump.
#
# Exit-code contract:
#   0 — every checked binary is current OR at most patch-level behind
#       (patches usually carry security fixes only and don't block a release)
#   1 — at least one binary is ≥1 minor version behind (drift worth a bump)
#   2 — environmental error (missing tool, missing cli-deps.json) — distinct
#       from drift so a CI consumer can tell apart "drift detected" from
#       "couldn't run"
#
# Network failures on a single row are reported as `(network error)` and do
# NOT change the exit code: the row is excluded from the drift vote, so a
# flaky `gh api` call cannot flip a clean check to a false 1 or a real
# drift to a false 0. Final code reflects only resolved rows. Rate-limit
# failures are reported distinctly as `(GitHub rate limit hit — retry
# after reset)` so the contributor knows to wait 1h vs check connectivity.
#
# Why `gh api` and not curl: gh reuses the contributor's authenticated
# GitHub session (5000 req/hr ceiling) instead of unauthenticated 60/hr.
# Intended for pre-release-PR integration once wired into
# `.github/workflows/`; not currently invoked from any workflow file in
# the repo (call site is a follow-up PR).
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPS_FILE="$REPO_ROOT/cli-deps.json"
[ -f "$DEPS_FILE" ] || { echo "ERROR: cli-deps.json not found at $DEPS_FILE" >&2; exit 2; }
for cmd in jq gh; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd is required but not installed" >&2; exit 2; }
done

# ANSI color only when stdout is a tty — piping to a file or `tee` strips
# the escape codes so CI logs / grep stay clean.
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
else
  C_RED=""; C_YEL=""; C_DIM=""; C_RST=""
fi

# Drift flag — set when any row is ≥1 minor behind. Network errors, rate
# limits, and patch-only drift do not set this. Final exit reflects only
# this flag.
DRIFT=0

# ---------------------------------------------------------------------------
# Numeric semver compare. Splits "X.Y.Z" on dots, pads to 3 segments, and
# returns "current | patch:N | minor:N | major:N" where N is the actual
# gap at that level (so "3 minor behind" is reported when codex is 3
# minors behind, not the misleading hardcoded "1 minor behind"). We compare
# as numbers (10# zero-padded form) so `0.130.0` vs `0.131.0` orders
# correctly — string compare happens to work for these specific values but
# breaks the moment a two-digit minor meets a three-digit one. Pre-release
# suffixes (-beta.N, -rc.N) are stripped before split. Non-numeric input
# falls through to `network`, NOT `current` — silently degrading malformed
# upstream data to "current" would hide a real failure (this used to be
# a false-positive vector before the gh_api_tag helper).
# Bash 3.2: no associative arrays, plain IFS-based split.
# ---------------------------------------------------------------------------
compare_versions() {
  local pinned="${1%%-*}" latest="${2%%-*}"
  case "$pinned$latest" in *[!0-9.]*) echo "network"; return ;; esac
  local IFS=.
  # shellcheck disable=SC2206  # intentional word-split on '.'
  local p=($pinned) l=($latest)
  local i p_i l_i gap
  for i in 0 1 2; do
    p_i=$((10#${p[$i]:-0})); l_i=$((10#${l[$i]:-0}))
    if [ "$p_i" -lt "$l_i" ]; then
      gap=$((l_i - p_i))
      case $i in 0) echo "major:$gap";; 1) echo "minor:$gap";; 2) echo "patch:$gap";; esac
      return
    elif [ "$p_i" -gt "$l_i" ]; then
      # Pinned ahead of upstream — treat as current. Happens when we pin a
      # pre-release we built locally that hasn't shipped upstream yet.
      echo "current"; return
    fi
  done
  echo "current"
}

# Format one row + accumulate drift. `kind` is compare_versions output OR
# the sentinel strings `network` / `ratelimit` / `proprietary`.
emit_row() {
  local name="$1" pinned="$2" latest="$3" kind="$4"
  local note="" color="" level="${kind%%:*}" gap="${kind#*:}" unit=""
  case "$level" in
    current)     note="current" ;;
    patch)       unit=$([ "$gap" -eq 1 ] && echo patch || echo patches)
                 note="$gap $unit behind";                         color="$C_YEL" ;;
    minor)       unit=$([ "$gap" -eq 1 ] && echo minor || echo minors)
                 note="$gap $unit behind  (drift)";                color="$C_RED"; DRIFT=1 ;;
    major)       unit=$([ "$gap" -eq 1 ] && echo major || echo majors)
                 note="$gap $unit behind  (drift)";                color="$C_RED"; DRIFT=1 ;;
    network)     note="(network error)";                           color="$C_DIM" ;;
    ratelimit)   note="(GitHub rate limit hit, retry after reset)"; color="$C_YEL" ;;
    proprietary) printf "%b%-16s %-8s             %s%b\n" "$C_DIM" "$name" "$pinned" \
                        "(proprietary, no upstream API)" "$C_RST"; return ;;
  esac
  printf "%b%-16s %-8s -> %-8s %s%b\n" "$color" "$name" "$pinned" "$latest" "$note" "$C_RST"
}

# ---------------------------------------------------------------------------
# Helper — wraps `gh api ...` with rate-limit detection and null-tag
# rejection. Returns:
#   0  -> success; prints tag on stdout
#   1  -> generic network/API failure, OR upstream returned `null` (zero
#         releases) — both produce `(network error)` in the row
#   2  -> GitHub rate-limit hit (5000/hr ceiling on authenticated calls)
#
# Distinguishing 1 vs 2 lets the contributor know to wait an hour (rate
# limit reset) vs check their connection — without this, both surface
# as `(network error)` and the contributor cannot act on the right
# remediation. Stderr capture-and-grep against `gh`'s canonical "API rate
# limit exceeded" wording is the cheapest reliable detector.
#
# Null-tag rejection guards against the silent-false-current failure
# mode: a repo with zero releases makes `gh api .../releases/latest`
# exit 0 with stdout `null`. Without the explicit reject, the prefix
# strip yields `null` which compare_versions's non-numeric guard
# silently degrades to "current" — masking a real lookup failure.
# ---------------------------------------------------------------------------
gh_api_tag() {
  local stderr tag rc=0
  stderr=$(mktemp)
  tag=$(gh api "$@" 2>"$stderr") || rc=$?
  if [ "$rc" -ne 0 ]; then
    if grep -qi 'rate limit\|api rate\|secondary rate' "$stderr"; then
      rm -f "$stderr"
      return 2
    fi
    rm -f "$stderr"
    return 1
  fi
  rm -f "$stderr"
  # Reject null / empty tags — `gh api` exits 0 with stdout "null" when
  # the repo has zero releases, which would otherwise silently degrade to
  # a false "current" verdict downstream.
  [ -n "$tag" ] && [ "$tag" != "null" ] || return 1
  printf '%s\n' "$tag"
}

# ---------------------------------------------------------------------------
# Upstream lookups. Each calls gh_api_tag (so each gets rate-limit
# distinction + null guard for free) and either prints bare X.Y.Z on
# stdout, or returns 1/2 to signal network/ratelimit.
# ---------------------------------------------------------------------------

# openai/codex tags releases as `rust-v0.133.0` — the `rust-v` prefix
# disambiguates the production Rust port from an older TypeScript prototype
# on a separate tag namespace in the same repo.
latest_codex() {
  local tag
  tag=$(gh_api_tag repos/openai/codex/releases/latest --jq '.tag_name') || return $?
  echo "${tag#rust-v}"
}

# ComposioHQ/composio is a monorepo of ~30 packages; every package gets
# its own scoped tag (`@composio/cli@X.Y.Z`, `@composio/python@…`, etc.).
# `releases/latest` returns whichever package shipped most recently —
# almost never the CLI. So we filter for the CLI prefix AND strip
# prereleases (`.prerelease == false`): the CLI's cadence is heavy on
# `-beta.N` tags (256+ betas between 0.2.24 and 0.2.31 at time of
# writing) and a contributor bumping should land on the latest STABLE,
# not the bleeding-edge beta.
latest_composio() {
  local tag
  tag=$(gh_api_tag repos/ComposioHQ/composio/releases \
        --jq '[.[] | select(.tag_name|startswith("@composio/cli@")) | select(.prerelease==false)] | .[0].tag_name') \
        || return $?
  echo "${tag#@composio/cli@}"
}

# google-gemini/gemini-cli uses a vanilla `vX.Y.Z` tag namespace. No quirks.
latest_gemini() {
  local tag
  tag=$(gh_api_tag repos/google-gemini/gemini-cli/releases/latest --jq '.tag_name') || return $?
  echo "${tag#v}"
}

# git-for-windows tags every release as `vX.Y.Z.windows.N` — the
# `.windows.N` is upstream's build number for the Windows-specific
# packaging of a given upstream Git release. We strip both the leading
# `v` and the trailing `.windows.N` so the comparison against the pinned
# `X.Y.Z` works at the semver level. Drift at the `.windows.N` tier
# would require its own pin field in cli-deps.json — not modeled today.
latest_git_bash() {
  local tag rest
  tag=$(gh_api_tag repos/git-for-windows/git/releases/latest --jq '.tag_name') || return $?
  rest="${tag#v}"
  echo "${rest%%.windows.*}"
}

# ---------------------------------------------------------------------------
# Dispatch one row. Order: claude-code first so the proprietary line sets
# expectations, then alphabetical for the rest. Each upstream call's exit
# code threads through `rc`: 0 -> compare normally, 1 -> network row,
# 2 -> rate-limit row.
# ---------------------------------------------------------------------------
check_one() {
  local name="$1" pinned latest rc=0
  pinned=$(jq -r ".[\"$name\"].version // empty" "$DEPS_FILE")
  [ -n "$pinned" ] || { emit_row "$name" "?" "?" "network"; return; }
  case "$name" in
    claude-code) emit_row "$name" "$pinned" "" "proprietary"; return ;;
    codex)    latest=$(latest_codex)    || rc=$? ;;
    composio) latest=$(latest_composio) || rc=$? ;;
    gemini)   latest=$(latest_gemini)   || rc=$? ;;
    git-bash) latest=$(latest_git_bash) || rc=$? ;;
    *)        emit_row "$name" "$pinned" "?" "network"; return ;;
  esac
  case "$rc" in
    0) emit_row "$name" "$pinned" "$latest" "$(compare_versions "$pinned" "$latest")" ;;
    1) emit_row "$name" "$pinned" "?" "network" ;;
    2) emit_row "$name" "$pinned" "?" "ratelimit" ;;
    *) emit_row "$name" "$pinned" "?" "network" ;;
  esac
}

for name in claude-code codex composio gemini git-bash; do
  check_one "$name"
done

exit "$DRIFT"
