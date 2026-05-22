#!/usr/bin/env bash
# ============================================================================
# Houston banned-patterns linter — machine-checks CLAUDE.md §"No silent
# failures (beta-stage policy)" so the rule stops being a ritual a human
# reviewer has to enforce by eye and starts being a concrete behavior an
# agent (or contributor) can run before opening a PR.
#
# Why this exists:
#   CLAUDE.md enumerates 6 banned Rust patterns and 5 banned TypeScript
#   patterns. This script implements 5 Rust + 5 TypeScript = 10 of them
#   statically. The 6th Rust pattern (catch-and-tracing::warn!-and-
#   continue INSIDE a `for`/`while`/`loop` block — the canonical
#   `install_from_repo` "skip" anti-example in CLAUDE.md) requires
#   loop-context awareness that bash + rg cannot supply: a generic
#   log-and-continue match arm is flagged, but the linter cannot decide
#   whether the arm is inside a loop. That pattern stays in the
#   KNOWN LIMITATIONS section below — manual-review-only.
#
# Exit-code contract:
#   Default mode is warn-only — the script ALWAYS exits 0 even when it
#   finds violations. This is not because some external rule endorses
#   warn-first; it's because the existing tree carries pre-policy drift,
#   and a CI-breaking gate on day one would block every PR for a week.
#   The plan is: ship the tool, run a one-shot cleanup PR to bring the
#   tree to zero violations, then flip --strict on in CI as a follow-up.
#   --strict flips exit to 1 on any violation, for the post-cleanup world.
#
# Allow-comment override:
#   A line carrying the trailing comment `// allow-silent-failure: <why>`
#   (configurable via --allowlist-comment) is exempt. The reason MUST be
#   non-empty — `// allow-silent-failure:` alone does NOT exempt; a
#   contributor has to type something after the colon. Use sparingly —
#   the policy is "noise over silence", not "allow over noise".
#
# File-size note:
#   This script is over the 200-line cap CLAUDE.md sets for source files;
#   bash scripts are exempt by convention (the cap is documented in the
#   "File size limits" rule which lists code files, not tooling). The
#   detection logic is hard to split without losing locality between
#   patterns, their exclusions, and the violation accounting. If we ever
#   split, the natural boundaries are: arg parsing / rust scans / ts
#   scans / output. A follow-up PR can refactor.
#
# Heuristics documented inline:
#   - #[cfg(test)] inline modules are stripped pre-scan via an awk
#     state machine (brace-depth tracking) for BOTH single-line and
#     multiline scanners. Unwrap/expect/log-and-continue hits inside
#     those blocks are correctly skipped without depending on path.
#   - unwrap_or family hits in **/config.rs, **/startup.rs, **/init.rs,
#     and **/main.rs are excluded — CLAUDE.md scopes the ban to
#     user-initiated ops, and startup config defaults are not.
#   - .unwrap() immediately after a string-literal .parse() (the
#     `"*".parse::<HeaderValue>().unwrap()` shape) is exempt as a
#     compile-time invariant. Other invariants need an explicit allow
#     comment.
#   - Multiline categories (log-and-continue, catch-console-only,
#     catch-silent) use rg --json mode; rg --json -U emits exactly
#     one record per match (not per body line), so the awk dedup
#     pass is belt-and-suspenders, NOT load-bearing.
#   - catch-silent and catch-console-only are MUTUALLY EXCLUSIVE.
#     catch-silent's body-exclusion regex includes `console\.` so a
#     `catch (e) { console.error(e) }` block matches catch-console-only
#     ONLY. catch-silent flags blocks with NO surfacing AND NO logging.
#   - Fire-and-forget is split into TWO scans because setTimeout /
#     setInterval / requestAnimationFrame / queueMicrotask /
#     addEventListener are CALLED (parens) while DOM properties like
#     `el.onclick` are ASSIGNED (`=`). A previous single-regex shape
#     conflated the two and either missed the call form or over-matched
#     TanStack `onMutate:` / `onError:` properties. See the inline
#     comments at the two scan sites for the heuristic.
#   - log-and-continue regex covers tracing::(warn|error|info)!,
#     log::(warn|error|info)!, eprintln!, and println! — all four
#     macro families plausible inside an Err arm.
#
# KNOWN LIMITATIONS:
#   1. catch-silent uses `[^{}]*` to bound the catch body for a
#      single-pass scan. This UNDER-DETECTS catches whose body contains
#      nested braces (object literals, IIFEs, control-flow blocks).
#      Bash + rg cannot do brace balancing; we accept the false-NEGATIVE
#      because under-detection is strictly safer than the alternative
#      (over-detecting with a sloppy heuristic that flags non-silent
#      catches as silent).
#   2. strip_inline_tests is a regex-level heuristic, not a parser. It
#      matches `#[cfg(test)] mod <ident> { ... }` blocks where the
#      `mod` line opens its own brace. Edge cases not handled: a
#      `#[cfg(test)] mod foo;` declaration with the body in a sibling
#      file, conditional cfg attrs like `#[cfg(any(test, feature = "x"))]`,
#      or test mods with attributes between `#[cfg(test)]` and `mod`.
#      Affected matches inside such constructs may be reported as
#      production violations and need an `// allow-silent-failure:`
#      comment or a refactor.
#   3. unwrap/expect inside `#[cfg(test)] fn name() { ... }` (a test
#      function, not a test mod) is NOT exempted by strip_inline_tests
#      because the strip only targets the `mod <name>` shape. Test
#      functions outside a mod must use `*_test.rs` / `/tests/` paths
#      or the allow-comment to be exempted.
#   4. The 6th CLAUDE.md Rust pattern — catch-and-warn-and-continue
#      INSIDE a `for`/`while`/`loop` — is not detected because rg
#      cannot see loop context. log-and-continue match arms are
#      flagged regardless of containing-block; the loop-context
#      variant must be caught in human review.
#
# Dependencies:
#   bash 3.2+, ripgrep (rg), jq, grep, awk, printf — all already required
#   elsewhere in this repo (see scripts/fetch-cli-deps.sh).
# ============================================================================
set -euo pipefail

# Defaults — scan engine/ + app/src/ + ui/ by default (the surfaces
# governed by the no-silent-failures policy). Override with --paths.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCAN_RUST=1; SCAN_TS=1; FIX_HINT=0; STRICT=0; JSON=0
RUST_ONLY_SET=0; TS_ONLY_SET=0
ALLOW_COMMENT="// allow-silent-failure:"
PATHS_RAW="engine,app/src,ui"

usage() {
  cat <<'USAGE'
lint-banned-patterns.sh — machine-check CLAUDE.md §"No silent failures"

Usage:
  scripts/lint-banned-patterns.sh [flags]

Flags:
  --rust-only                 Scan Rust patterns only (skip TS)
  --ts-only                   Scan TypeScript patterns only (skip Rust)
  --fix-hint                  Print the suggested-fix string per violation
  --paths <a,b,c>             Comma-separated paths to scan (default:
                              engine,app/src,ui)
  --allowlist-comment <s>     Trail-comment that exempts a line, the
                              reason after the colon MUST be non-empty
                              (default: "// allow-silent-failure:")
  --strict                    Exit 1 on any violation (default: always 0)
  --json                      Emit NDJSON, one violation per line
  -h, --help                  This text

Categories (5 Rust + 5 TypeScript = 10):
  Rust:
    let-discard         — `let _ = <fallible>` discards a Result
    ok-discard          — `.ok()` drops a Result on the floor
    unwrap-or           — `.unwrap_or(...)` / `_default` / `_else` over
                          user-initiated ops (config/startup paths excluded)
    log-and-continue    — `Err(_) => { tracing::warn!(...) }` match arms
                          (also log::, eprintln!, println!)
    unwrap-expect       — `.unwrap()` / `.expect(...)` outside test code
                          and outside the `"lit".parse().unwrap()` shape
  TypeScript:
    catch-empty         — `.catch(() => null|[]|{})` returns dummy value
    catch-silent        — `try { ... } catch { ... }` with NO surfacing
                          AND NO logging (mutually exclusive with
                          catch-console-only)
    catch-console-only  — `catch (e) { console.error(e) }` log-only,
                          no surface (mutually exclusive with catch-silent)
    generic-toast       — `onError: () => toast.error("hardcoded string")`
                          instead of `errorMessage(err)`
    fire-and-forget     — `setTimeout(async () => {})` (invocation form)
                          OR `el.onclick = async () => {}` (assignment form)
                          fires Promise with no `.catch`

Examples:
  scripts/lint-banned-patterns.sh                 # full repo, warn-only
  scripts/lint-banned-patterns.sh --rust-only --paths engine
  scripts/lint-banned-patterns.sh --json | jq .   # programmatic consumption
  scripts/lint-banned-patterns.sh --strict        # CI-gating mode

Allow-comment grammar:
  Add `// allow-silent-failure: <non-empty reason>` to the offending line.
  An empty reason is rejected — the policy is documented exceptions, not
  blanket overrides.

Not detected (manual review required):
  - catch-and-warn-and-continue INSIDE a for/while/loop block (the
    `install_from_repo` "skip" pattern). rg cannot see loop context.
USAGE
}

# --help / -h must work without dependencies installed. Scan argv for the
# help flag BEFORE the dep check; if found, print usage and exit cleanly.
for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
  esac
done

# Dep check — fail loud (no silent failures, even in our own tooling).
for dep in rg jq grep awk; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    echo "ERROR: '$dep' is required but not installed" >&2
    case "$dep" in
      rg) echo "  brew install ripgrep | choco install ripgrep" >&2 ;;
      jq) echo "  brew install jq      | choco install jq" >&2 ;;
    esac
    exit 2
  fi
done

# Manual flag parsing — long-flag support, same convention as
# scripts/fetch-cli-deps.sh. We already consumed --help above.
while [ $# -gt 0 ]; do
  case "$1" in
    --rust-only) SCAN_TS=0; RUST_ONLY_SET=1; shift ;;
    --ts-only) SCAN_RUST=0; TS_ONLY_SET=1; shift ;;
    --fix-hint) FIX_HINT=1; shift ;;
    --paths)
      [ $# -ge 2 ] || { echo "ERROR: --paths requires an argument" >&2; exit 2; }
      PATHS_RAW="$2"; shift 2 ;;
    --allowlist-comment)
      [ $# -ge 2 ] || { echo "ERROR: --allowlist-comment requires an argument" >&2; exit 2; }
      ALLOW_COMMENT="$2"; shift 2 ;;
    --strict) STRICT=1; shift ;;
    --json) JSON=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown flag '$1' (try --help)" >&2; exit 2 ;;
  esac
done

# Mutual-exclusion check (P1-5): --rust-only and --ts-only together would
# silently disable both scans and produce 0 violations + exit 0. That's
# exactly the failure mode this linter exists to prevent.
if [ "$RUST_ONLY_SET" = 1 ] && [ "$TS_ONLY_SET" = 1 ]; then
  echo "ERROR: flags --rust-only and --ts-only are mutually exclusive" >&2
  exit 2
fi

# Comma-list -> array (bash 3.2 has no readarray). Sanity-check every
# path — a typo would otherwise produce a silent zero-pass, the exact
# failure mode this script exists to prevent.
PATHS_ARR=()
IFS=',' read -r -a PATHS_ARR <<<"$PATHS_RAW"
for p in "${PATHS_ARR[@]}"; do
  [ -e "$REPO_ROOT/$p" ] || { echo "ERROR: scan path does not exist: $p" >&2; exit 2; }
done

# Capture ripgrep stderr to a temp file (P0-5). Surface non-empty stderr
# at script exit with a clear header. Without this, every `rg 2>/dev/null`
# silently hides legitimate ripgrep failures (bad regex, permission
# denied) — the meta-irony of a no-silent-failures linter that swallows
# its own errors.
RG_ERR="$(mktemp -t lint-banned-patterns.rg.err.XXXXXX)"
trap 'rm -f "$RG_ERR"' EXIT

# rg returns exit 1 on "no matches" (normal) and exit 2+ on real errors.
# This helper normalizes 0/1 → 0 and propagates >1 unchanged so callers
# can distinguish empty-output from real failure.
#
# Convention (N11): every `rg` invocation in this script routes through
# `run_rg`, and every command substitution wrapping it ends with
# `|| true` so a real-error exit doesn't abort the whole script under
# `set -e`. Real errors are still surfaced — they write to $RG_ERR
# (captured stderr) which is non-empty-checked and dumped at script end.
# The combination (`run_rg` for exit normalization + `|| true` for
# error tolerance + `RG_ERR` non-empty surfacing) is what keeps the
# linter loud about its own failures.
run_rg() {
  set +e
  rg "$@" 2>>"$RG_ERR"
  local code=$?
  set -e
  case "$code" in
    0|1) return 0 ;;
    *) return "$code" ;;
  esac
}

# Counters — bash 3.2 has no associative arrays, so one var per pattern.
C_RS_LET_DISCARD=0; C_RS_OK_DISCARD=0; C_RS_UNWRAP_OR=0; C_RS_LOG_CONT=0; C_RS_UNWRAP=0
C_TS_CATCH_EMPTY=0; C_TS_CATCH_SILENT=0; C_TS_CATCH_CONSOLE=0
C_TS_GENERIC_TOAST=0; C_TS_FIRE_FORGET=0
TOTAL=0

# allow_filter — reads stdin (filename:line:snippet), drops lines that
# carry a valid `// allow-silent-failure: <non-empty reason>` comment.
# Per P1-4, empty reasons do NOT exempt; the regex requires at least one
# non-whitespace character after the colon. Writes survivors to stdout.
allow_filter() {
  # We need a literal-then-regex match: literal allow-comment prefix,
  # then a non-empty trailing reason. Use grep -Ev with an escaped
  # version of $ALLOW_COMMENT (the user-supplied prefix may contain
  # regex metachars, so escape them).
  local esc
  esc="$(printf '%s' "$ALLOW_COMMENT" | sed 's/[][\\.^$*+?(){}|/]/\\&/g')"
  grep -Ev "${esc}[[:space:]]*[^[:space:]]" || true
}

# emit — one violation. Shape mirrors cargo/eslint:
#   <file>:<line>:<col>: [CATEGORY] <snippet>
# In --json mode: one NDJSON object instead.
emit() {
  local category="$1" file="$2" line="$3" col="$4" snippet="$5" hint="$6" severity="$7"
  if [ "$JSON" = 1 ]; then
    jq -cn \
      --arg file "$file" --argjson line "$line" --argjson col "$col" \
      --arg category "$category" --arg pattern "$category" \
      --arg snippet "$snippet" --arg severity "$severity" \
      '{file:$file, line:$line, col:$col, category:$category, pattern:$pattern, snippet:$snippet, severity:$severity}'
  else
    if [ "$FIX_HINT" = 1 ]; then
      printf '%s:%s:%s: [%s] %s\n    hint: %s\n' "$file" "$line" "$col" "$category" "$snippet" "$hint"
    else
      printf '%s:%s:%s: [%s] %s\n' "$file" "$line" "$col" "$category" "$snippet"
    fi
  fi
  TOTAL=$((TOTAL + 1))
}

# strip_inline_tests — read a Rust file, write it back to stdout with
# `#[cfg(test)] mod <name> { ... }` blocks replaced by blank lines so
# line numbers are preserved. Implements P1-2 (inline-test exclusion).
#
# State machine:
#   IN_BLOCK=0: looking for `#[cfg(test)]` followed by `mod <name> {`
#   IN_BLOCK=1: inside the test mod, tracking brace depth. Emit blank
#               lines until depth returns to 0, then resume.
strip_inline_tests() {
  awk '
    BEGIN { in_block = 0; depth = 0; pending_cfg = 0 }
    {
      if (in_block == 0) {
        if (pending_cfg && $0 ~ /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\{/) {
          in_block = 1
          # Count braces on this line to seed depth.
          for (i = 1; i <= length($0); i++) {
            c = substr($0, i, 1)
            if (c == "{") depth++
            else if (c == "}") depth--
          }
          print ""
          pending_cfg = 0
          next
        }
        if ($0 ~ /^[[:space:]]*#\[cfg\(test\)\]/) {
          pending_cfg = 1
          print ""
          next
        }
        # Pending cfg(test) but next non-blank line was not a mod — clear.
        if (pending_cfg && $0 !~ /^[[:space:]]*$/) pending_cfg = 0
        print
        next
      }
      # in_block == 1: track braces, emit blank lines.
      for (i = 1; i <= length($0); i++) {
        c = substr($0, i, 1)
        if (c == "{") depth++
        else if (c == "}") depth--
      }
      print ""
      if (depth <= 0) {
        in_block = 0
        depth = 0
      }
    }
  ' "$1"
}

# scan_rust_singleline — run a single-line regex on Rust files,
# stripping #[cfg(test)] inline modules first. Common path for
# let-discard, ok-discard, unwrap_or, unwrap/expect.
#
# Args: category hint regex extra_path_excl severity counter_var
#   extra_path_excl: an ERE that filters out matches whose file path
#   matches the pattern (e.g. for excluding config.rs paths).
scan_rust_singleline() {
  local category="$1" hint="$2" regex="$3" path_excl="$4"
  local severity="$5" counter_var="$6"
  # Test-code exclusion regex — catches `*_test.rs`, `tests/*.rs`,
  # `tests.rs`. Inline `#[cfg(test)] mod tests {}` blocks are handled
  # by strip_inline_tests below.
  local test_excl='(_test\.rs:|/tests/[^:]*\.rs:|/tests\.rs:)'

  # List Rust files under PATHS once.
  local files
  files="$(cd "$REPO_ROOT" && run_rg --files --type rust "${PATHS_ARR[@]}" || true)"
  [ -z "$files" ] && return 0

  # For each file: strip inline tests, then scan. We accumulate matches
  # in a buffer and process them at the end.
  local buf=""
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    # Skip files matching the test-file exclusion to avoid scanning them.
    case "$file" in
      *_test.rs|*/tests/*.rs|*/tests.rs) continue ;;
    esac
    # Apply path-based exclusion (e.g. config.rs for unwrap_or).
    if [ -n "$path_excl" ]; then
      if printf '%s' "$file" | grep -Eq "$path_excl"; then continue; fi
    fi
    local stripped
    stripped="$(strip_inline_tests "$REPO_ROOT/$file")"
    local hits
    hits="$(printf '%s\n' "$stripped" | run_rg -n -H --no-heading --no-filename "$regex" || true)"
    [ -z "$hits" ] && continue
    while IFS= read -r line_entry; do
      [ -z "$line_entry" ] && continue
      buf="${buf}${file}:${line_entry}"$'\n'
    done <<<"$hits"
  done <<<"$files"

  [ -z "$buf" ] && return 0
  # Apply: allow-comment filter, then test-file exclusion (belt-and-
  # suspenders; we already filtered by name above, but a regex check
  # on the joined "file:line" string is cheap). Also drop pure
  # `// ...` comment lines — a doc comment that mentions the banned
  # pattern is not itself a banned pattern.
  local filtered
  filtered="$(printf '%s' "$buf" \
    | allow_filter \
    | grep -Ev -- "$test_excl" \
    | grep -Ev '^[^:]+:[0-9]+:[[:space:]]*//' \
    || true)"
  [ -z "$filtered" ] && return 0

  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    local file line snippet col
    file="${entry%%:*}"
    local rest="${entry#*:}"
    line="${rest%%:*}"
    snippet="${rest#*:}"
    col="$(printf '%s' "$snippet" | awk '{ match($0, /[^ \t]/); print (RSTART>0?RSTART:1) }')"
    snippet="$(printf '%s' "$snippet" | awk '{$1=$1; print}')"
    emit "$category" "$file" "$line" "$col" "$snippet" "$hint" "$severity"
    eval "$counter_var=\$(($counter_var + 1))"
  done <<<"$filtered"
}

# scan_rust_multiline_json — multiline regex via rg --json, one
# violation per match (rg --json -U emits exactly one record per
# match; the awk dedup pass below is belt-and-suspenders, NOT
# load-bearing).
#
# P1-2 fix: pre-strip each Rust file through strip_inline_tests into
# a mirrored temp dir before scanning, so multiline scans also exclude
# `#[cfg(test)] mod tests { }` bodies. Line numbers are preserved by
# the blank-line replacement strategy in strip_inline_tests, so no
# line-number adjustment is needed when surfacing matches against the
# original path.
#
# Args: category hint regex severity counter_var
scan_rust_multiline_json() {
  local category="$1" hint="$2" regex="$3"
  local severity="$4" counter_var="$5"
  local test_excl='(_test\.rs|/tests/[^/]+\.rs|/tests\.rs)'

  # List Rust files under PATHS, then build a mirrored temp tree of
  # stripped files. We can then run rg --json against the temp tree
  # and translate path prefixes back at output time.
  local files
  files="$(cd "$REPO_ROOT" && run_rg --files --type rust "${PATHS_ARR[@]}" || true)"
  [ -z "$files" ] && return 0

  local tmp_root
  tmp_root="$(mktemp -d -t lint-banned-patterns.rs.XXXXXX)"
  # Cleanup the temp tree at function exit even on errors.
  # shellcheck disable=SC2064 # we want $tmp_root expanded NOW
  trap "rm -rf '$tmp_root'" RETURN

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
      *_test.rs|*/tests/*.rs|*/tests.rs) continue ;;
    esac
    local out_path="$tmp_root/$file"
    mkdir -p "$(dirname "$out_path")"
    strip_inline_tests "$REPO_ROOT/$file" >"$out_path"
  done <<<"$files"

  # Only pass paths that actually got mirrored (some PATHS_ARR entries
  # may be TS-only and have no Rust files; passing them to rg would
  # produce "No such file" stderr noise that surfaces at script end).
  local mirrored_paths=()
  for p in "${PATHS_ARR[@]}"; do
    [ -e "$tmp_root/$p" ] && mirrored_paths+=("$p")
  done
  [ "${#mirrored_paths[@]}" -eq 0 ] && return 0

  local json
  # Run rg against the stripped tree. rg's reported paths will be
  # relative to $tmp_root with the same internal structure as the
  # original repo, so stripping the prefix yields the original path.
  json="$(cd "$tmp_root" && run_rg --json --type rust -U --multiline --multiline-dotall \
    "$regex" "${mirrored_paths[@]}" || true)"
  [ -z "$json" ] && return 0

  # rg --json -U emits one record per match (NOT per body line); the
  # dedup below is defensive. jq projects each match record to a
  # compact JSON object with file/line/offset/snippet keys.
  local dedup
  dedup="$(printf '%s\n' "$json" | jq -rc '
    select(.type=="match") |
    {file: .data.path.text, line: .data.line_number,
     offset: .data.absolute_offset, snippet: .data.lines.text}
    | @json
  ' || true)"
  [ -z "$dedup" ] && return 0

  # Dedup pass (belt-and-suspenders against rg --json -U's one-per-
  # match guarantee). Group by file+offset, keep first record per
  # group. awk works on the JSON-encoded records.
  local grouped
  grouped="$(printf '%s\n' "$dedup" | awk '
    {
      key = $0
      gsub(/.*"file":"/, "", key)
      gsub(/","line".*/, "", key)
      file = key
      off = $0
      gsub(/.*"offset":/, "", off)
      gsub(/,.*$/, "", off)
      k = file ":" off
      if (!(k in seen)) {
        seen[k] = 1
        print
      }
    }
  ')"
  [ -z "$grouped" ] && return 0

  while IFS= read -r record; do
    [ -z "$record" ] && continue
    local file line snippet
    file="$(printf '%s' "$record" | jq -r '.file')"
    line="$(printf '%s' "$record" | jq -r '.line')"
    snippet="$(printf '%s' "$record" | jq -r '.snippet' | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g; s/^[[:space:]]*//; s/[[:space:]]*$//')"
    # Test-file exclusion (path-based; inline `#[cfg(test)] mod tests`
    # blocks were already stripped into the temp tree above).
    if printf '%s' "$file" | grep -Eq "$test_excl"; then continue; fi
    # Allow-comment check on the snippet itself.
    local esc
    esc="$(printf '%s' "$ALLOW_COMMENT" | sed 's/[][\\.^$*+?(){}|/]/\\&/g')"
    if printf '%s' "$snippet" | grep -Eq "${esc}[[:space:]]*[^[:space:]]"; then continue; fi
    local col
    col="$(printf '%s' "$snippet" | awk '{ match($0, /[^ \t]/); print (RSTART>0?RSTART:1) }')"
    emit "$category" "$file" "$line" "$col" "$snippet" "$hint" "$severity"
    eval "$counter_var=\$(($counter_var + 1))"
  done <<<"$grouped"
}

# scan_ts_multiline_json — multiline regex via rg --json against TS
# files, with a body-content exclusion (drop matches whose snippet
# contains any of the listed terms). Used for catch-silent (must NOT
# contain throw/toast/etc) and catch-console-only.
#
# TS has no `#[cfg(test)]` equivalent so there's no inline-test-strip
# step (P1-2 applies to Rust only). We do filter test-shaped paths
# (`*.test.ts`, `*.spec.ts`, `__tests__/...`) at output time.
#
# Args: category hint regex body_excl_regex severity counter_var
#   body_excl_regex: an ERE; if the match snippet matches, the match
#   is filtered out (used to exclude `throw`/`toast`/`addToast`/
#   `errorMessage`/`notify` bodies from catch-silent).
scan_ts_multiline_json() {
  local category="$1" hint="$2" regex="$3" body_excl="$4"
  local severity="$5" counter_var="$6"
  local test_excl='(\.test\.tsx?$|\.spec\.tsx?$|/__tests__/)'

  local json
  json="$(cd "$REPO_ROOT" && run_rg --json --type ts -U --multiline --multiline-dotall \
    "$regex" "${PATHS_ARR[@]}" || true)"
  [ -z "$json" ] && return 0

  local dedup
  dedup="$(printf '%s\n' "$json" | jq -rc '
    select(.type=="match") |
    {file: .data.path.text, line: .data.line_number,
     offset: .data.absolute_offset, snippet: .data.lines.text}
    | @json
  ' || true)"
  [ -z "$dedup" ] && return 0

  # Dedup pass (belt-and-suspenders against rg --json -U's one-per-
  # match guarantee).
  local grouped
  grouped="$(printf '%s\n' "$dedup" | awk '
    {
      key = $0
      gsub(/.*"file":"/, "", key)
      gsub(/","line".*/, "", key)
      file = key
      off = $0
      gsub(/.*"offset":/, "", off)
      gsub(/,.*$/, "", off)
      k = file ":" off
      if (!(k in seen)) {
        seen[k] = 1
        print
      }
    }
  ')"
  [ -z "$grouped" ] && return 0

  while IFS= read -r record; do
    [ -z "$record" ] && continue
    local file line snippet
    file="$(printf '%s' "$record" | jq -r '.file')"
    line="$(printf '%s' "$record" | jq -r '.line')"
    snippet="$(printf '%s' "$record" | jq -r '.snippet' | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g; s/^[[:space:]]*//; s/[[:space:]]*$//')"
    if printf '%s' "$file" | grep -Eq "$test_excl"; then continue; fi
    if [ -n "$body_excl" ]; then
      if printf '%s' "$snippet" | grep -Eq "$body_excl"; then continue; fi
    fi
    local esc
    esc="$(printf '%s' "$ALLOW_COMMENT" | sed 's/[][\\.^$*+?(){}|/]/\\&/g')"
    if printf '%s' "$snippet" | grep -Eq "${esc}[[:space:]]*[^[:space:]]"; then continue; fi
    local col
    col="$(printf '%s' "$snippet" | awk '{ match($0, /[^ \t]/); print (RSTART>0?RSTART:1) }')"
    emit "$category" "$file" "$line" "$col" "$snippet" "$hint" "$severity"
    eval "$counter_var=\$(($counter_var + 1))"
  done <<<"$grouped"
}

# scan_ts_singleline — single-line regex on TS/TSX files.
scan_ts_singleline() {
  local category="$1" hint="$2" regex="$3"
  local severity="$4" counter_var="$5"

  local raw
  raw="$(cd "$REPO_ROOT" && run_rg -n -H --no-heading --type ts \
    "$regex" "${PATHS_ARR[@]}" || true)"
  [ -z "$raw" ] && return 0

  local filtered
  filtered="$(printf '%s\n' "$raw" | allow_filter || true)"
  [ -z "$filtered" ] && return 0

  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    local file line snippet col
    file="${entry%%:*}"
    local rest="${entry#*:}"
    line="${rest%%:*}"
    snippet="${rest#*:}"
    col="$(printf '%s' "$snippet" | awk '{ match($0, /[^ \t]/); print (RSTART>0?RSTART:1) }')"
    snippet="$(printf '%s' "$snippet" | awk '{$1=$1; print}')"
    emit "$category" "$file" "$line" "$col" "$snippet" "$hint" "$severity"
    eval "$counter_var=\$(($counter_var + 1))"
  done <<<"$filtered"
}

# scan_rust_unwrap — special-case unwrap/expect scan that also exempts
# the `"literal".parse[...]().unwrap()` compile-time-invariant shape
# (P1-6). Other compile-time invariants still need an allow comment.
scan_rust_unwrap() {
  local category="BANNED-PATTERN-unwrap-expect"
  local hint='replace with ? (or .expect("compile-time invariant: …") with rationale)'
  local severity="warning"
  local test_excl='(_test\.rs:|/tests/[^:]*\.rs:|/tests\.rs:)'

  local files
  files="$(cd "$REPO_ROOT" && run_rg --files --type rust "${PATHS_ARR[@]}" || true)"
  [ -z "$files" ] && return 0

  local buf=""
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
      *_test.rs|*/tests/*.rs|*/tests.rs) continue ;;
    esac
    local stripped
    stripped="$(strip_inline_tests "$REPO_ROOT/$file")"
    local hits
    hits="$(printf '%s\n' "$stripped" | run_rg -n --no-filename '\.unwrap\(\)|\.expect\(' || true)"
    [ -z "$hits" ] && continue
    while IFS= read -r line_entry; do
      [ -z "$line_entry" ] && continue
      buf="${buf}${file}:${line_entry}"$'\n'
    done <<<"$hits"
  done <<<"$files"

  [ -z "$buf" ] && return 0
  # Exempt compile-time invariants: a quoted string literal immediately
  # followed by `.parse(...)?.unwrap()`. Drop those matches. Also drop
  # lines whose first non-whitespace is `//` (comments — the unwrap regex
  # can match a sentence in a doc comment that just mentions the API).
  local filtered
  filtered="$(printf '%s' "$buf" | allow_filter \
    | grep -Ev -- "$test_excl" \
    | grep -Ev '^[^:]+:[0-9]+:[[:space:]]*//' \
    | grep -Ev '"[^"]*"\.parse(::<[^>]+>)?\(\)\.unwrap\(\)' \
    || true)"
  [ -z "$filtered" ] && return 0

  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    local file line snippet col
    file="${entry%%:*}"
    local rest="${entry#*:}"
    line="${rest%%:*}"
    snippet="${rest#*:}"
    col="$(printf '%s' "$snippet" | awk '{ match($0, /[^ \t]/); print (RSTART>0?RSTART:1) }')"
    snippet="$(printf '%s' "$snippet" | awk '{$1=$1; print}')"
    emit "$category" "$file" "$line" "$col" "$snippet" "$hint" "$severity"
    C_RS_UNWRAP=$((C_RS_UNWRAP + 1))
  done <<<"$filtered"
}

if [ "$SCAN_RUST" = 1 ]; then
  scan_rust_singleline "BANNED-PATTERN-let-discard" \
    "bind the result and surface via toast: let v = expr.map_err(...)?;" \
    '^\s*let\s+_\s*=' \
    "" "warning" "C_RS_LET_DISCARD"
  scan_rust_singleline "BANNED-PATTERN-ok-discard" \
    "do not discard: propagate with ? or surface via errorMessage(err)" \
    '\.ok\(\)\s*;' \
    "" "warning" "C_RS_OK_DISCARD"
  # unwrap_or family — exclude startup config defaults. CLAUDE.md scopes
  # the ban to user-initiated ops; env-var defaults and similar startup
  # bootstrapping are not. P1-3.
  scan_rust_singleline "BANNED-PATTERN-unwrap-or" \
    "do not paper over: ? or .map_err(|e| AppError::from(e))?" \
    '\.unwrap_or(_default|_else)?\(' \
    '/(config|startup|init|main)\.rs$' "warning" "C_RS_UNWRAP_OR"
  # log-and-continue — match arms binding the error (Err(e), Err(err),
  # Err(_), Err(any_lowercase_ident)) that log via any of the four
  # plausible Rust log-macro families: tracing::, log::, eprintln!,
  # println!. CLAUDE.md's one exception (`tracing::error!` from
  # event-emit / file-watcher callbacks where there is no UI thread to
  # toast on) goes through the // allow-silent-failure: comment route.
  scan_rust_multiline_json "BANNED-PATTERN-log-and-continue" \
    "return the error; let the caller toast it" \
    'Err\(\s*(_|[a-z_]\w*)\s*\)\s*=>\s*\{[^}]*((tracing|log)::(warn|error|info)!|eprintln!|println!)' \
    "warning" "C_RS_LOG_CONT"
  scan_rust_unwrap
fi

if [ "$SCAN_TS" = 1 ]; then
  # catch-empty — `.catch(() => null/[]/{})` style.
  scan_ts_singleline "BANNED-PATTERN-catch-empty" \
    "throw or call errorMessage(err); never substitute null/[]/{}" \
    '\.catch\(\(\)\s*=>\s*(null|\[\s*\]|\{\s*\}|return\s+(null|\[|\{))' \
    "warning" "C_TS_CATCH_EMPTY"
  # catch-silent — bare `} catch { ... }` (or with bound err) whose body
  # contains NO surfacing (throw / toast / addToast / errorMessage /
  # notify) AND NO logging (console.*). Mutually exclusive with
  # catch-console-only: a catch that ONLY logs goes to catch-console-only,
  # a catch that has neither logging NOR surfacing goes here. Previous
  # rounds omitted `console.` from the exclusion list and double-flagged
  # `catch (e) { console.error(e) }` as both categories — fixed now.
  scan_ts_multiline_json "BANNED-PATTERN-catch-silent" \
    "rethrow or call errorMessage(err) + toastError(msg)" \
    '\}\s*catch\s*(\([^)]*\))?\s*\{[^{}]*\}' \
    '(throw|toast|addToast|errorMessage|notify|console\.(error|warn|log|info|debug))' \
    "warning" "C_TS_CATCH_SILENT"
  # catch-console-only — console.* inside the catch block, no surfacing.
  # Mutually exclusive with catch-silent: logging means we land here,
  # not in catch-silent (whose body-exclusion list contains console.*).
  # The matched shape is intentionally `try { ... } catch { console.* }`
  # so we don't double-flag a `try { ... } catch { errorMessage(e) }` —
  # but the exclusion is already baked into the regex by requiring
  # `console.` IN the body.
  scan_ts_multiline_json "BANNED-PATTERN-catch-console-only" \
    "toast: const msg = errorMessage(err); toastError(msg)" \
    'try\s*\{[^}]*\}\s*catch\s*(\([^)]*\))?\s*\{[^}]*console\.(error|warn|log|info|debug)[^}]*\}' \
    "" "warning" "C_TS_CATCH_CONSOLE"
  # generic-toast — hardcoded string in onError instead of errorMessage(err).
  scan_ts_singleline "BANNED-PATTERN-generic-toast" \
    "use errorMessage(err) — never a hardcoded string" \
    'onError\s*:\s*\([^)]*\)\s*=>\s*toast\.(error|warning)\(["'"'"'][A-Z]' \
    "warning" "C_TS_GENERIC_TOAST"
  # fire-and-forget — split into TWO scans because the canonical
  # offenders come in two SHAPES that cannot share a regex:
  #
  #   (1) INVOCATION-FORM: setTimeout / setInterval /
  #       requestAnimationFrame / queueMicrotask / addEventListener
  #       are CALLED with an async callback as an argument:
  #         setTimeout(async () => { await x() }, 100)
  #       For addEventListener the callback is the SECOND positional
  #       arg, hence the `[^,]+,\s*` pre-amble inside the regex —
  #       documented heuristic, not a parser.
  #
  #   (2) ASSIGNMENT-FORM: real DOM-property handlers are ASSIGNED to
  #       an `on<lowercase>` property of an element:
  #         el.onclick = async () => { await x() }
  #       The lowercase restriction excludes TanStack Query and
  #       form-library option objects (`{ onMutate: async ..., onError:
  #       async ..., onSuccess: async ... }`), which are NOT
  #       fire-and-forget — those callbacks have well-defined error
  #       handling via the library's contract.
  #
  # A previous rework conflated the two shapes into one regex requiring
  # `[=:]` after the identifier, which made the canonical
  # `setTimeout(async () => {}, 100)` shape dead code (setTimeout is
  # called, not assigned). Splitting is what makes both shapes work.
  scan_ts_singleline "BANNED-PATTERN-fire-and-forget" \
    "either await with try/catch+toast, or chain .catch(errorMessage)" \
    '\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask|addEventListener)\s*\(\s*([^,)]*,\s*)?async\s*(\([^)]*\)|[a-zA-Z_]\w*)\s*=>' \
    "warning" "C_TS_FIRE_FORGET"
  scan_ts_singleline "BANNED-PATTERN-fire-and-forget" \
    "either await with try/catch+toast, or chain .catch(errorMessage)" \
    '\.on[a-z]+\s*=\s*async\s*(\([^)]*\)|[a-zA-Z_]\w*)\s*=>' \
    "warning" "C_TS_FIRE_FORGET"
fi

# Surface ripgrep stderr if any was captured (P0-5). Empty stderr means
# clean scan; non-empty means a real error we want to know about.
if [ -s "$RG_ERR" ]; then
  echo "" >&2
  echo "ripgrep reported errors during scan:" >&2
  cat "$RG_ERR" >&2
fi

# Summary (suppressed in --json — consumer counts NDJSON entries itself).
if [ "$JSON" != 1 ]; then
  printf '\nlint-banned-patterns.sh summary:\n'
  printf '  paths:       %s\n  allow tag:   %s\n  total:       %s\n' \
    "$PATHS_RAW" "$ALLOW_COMMENT" "$TOTAL"
  if [ "$SCAN_RUST" = 1 ]; then
    printf '  rust:\n    let-discard:        %s\n    ok-discard:         %s\n' \
      "$C_RS_LET_DISCARD" "$C_RS_OK_DISCARD"
    printf '    unwrap_or family:   %s\n    log-and-continue:   %s\n    unwrap/expect:      %s\n' \
      "$C_RS_UNWRAP_OR" "$C_RS_LOG_CONT" "$C_RS_UNWRAP"
  fi
  if [ "$SCAN_TS" = 1 ]; then
    printf '  typescript:\n    catch-empty:        %s\n    catch-silent:       %s\n    catch-console-only: %s\n' \
      "$C_TS_CATCH_EMPTY" "$C_TS_CATCH_SILENT" "$C_TS_CATCH_CONSOLE"
    printf '    generic-toast:      %s\n    fire-and-forget:    %s\n' \
      "$C_TS_GENERIC_TOAST" "$C_TS_FIRE_FORGET"
  fi
  if [ "$STRICT" = 1 ] && [ "$TOTAL" -gt 0 ]; then
    echo "ERROR: $TOTAL banned-pattern violation(s) found (--strict)" >&2
    echo "See CLAUDE.md §\"No silent failures (beta-stage policy)\"." >&2
  fi
fi

[ "$STRICT" = 1 ] && [ "$TOTAL" -gt 0 ] && exit 1
exit 0
