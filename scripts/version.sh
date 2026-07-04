#!/usr/bin/env bash
set -euo pipefail

# Bump every package that shares Houston's single version line, in place,
# producing BYTE-IDENTICAL output on macOS, Linux, and Windows git-bash.
#
# Portability rules this script obeys (do NOT reintroduce the violations a
# release cut from a non-macOS host will hit):
#   * NO `jq` to rewrite JSON. The Windows jq build emits CRLF and
#     reserializes the whole document, turning a one-line version bump into
#     a full-file EOL-churn diff (and breaking the repo's LF-only rule).
#   * NO `sed -i ''` (BSD syntax). GNU sed on Linux + Windows git-bash reads
#     the empty '' as the script and aborts the whole run under `set -e`.
#   * `perl -i -pe` is the one editor present and identical on all three:
#     it rewrites a single matched line and never touches line endings, so
#     LF-in stays LF-out everywhere.

VERSION="${1:?Usage: ./scripts/version.sh <version>}"

# Validate semver up front so a typo can't smear a garbage value across ~30
# files. The regex also makes the unquoted "$VERSION" interpolations below
# (inside the perl programs) safe: only digits and dots ever reach them.
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver (e.g. 0.4.19), got: $VERSION" >&2
  exit 1
fi

echo "Bumping all packages to v$VERSION..."

# --- npm packages -----------------------------------------------------------
# Only the packages that share the Houston version line. ui/agent,
# ui/agent-schemas, ui/engine-client, ui/sync-protocol are versioned
# independently and are intentionally excluded.
#
# Rewrite ONLY the top-level "version" key. Dependencies are keyed by package
# name (never the literal "version"), so the first `"version":` line is always
# the package's own. The $d guard stops after the first hit per file so a
# stray nested "version" downstream can never be clobbered.
for f in package.json app/package.json \
         ui/core/package.json ui/chat/package.json ui/board/package.json \
         ui/layout/package.json ui/skills/package.json ui/events/package.json \
         ui/routines/package.json ui/review/package.json; do
  perl -i -pe 'BEGIN{$d=0} if(!$d && s/("version":\s*")[0-9]+\.[0-9]+\.[0-9]+(")/${1}'"$VERSION"'${2}/){$d=1}' "$f"
done

# --- Rust crates ------------------------------------------------------------
# Replace ONLY the first `^version = "..."` line (the `[package]` version),
# not dependency lines like:
#   [dependencies.thiserror]
#   version = "1"
# The $d guard stops after the first hit per file.
for toml in app/src-tauri/Cargo.toml; do
  perl -i -pe 'BEGIN{$d=0} if(!$d && /^version = "[^"]+"$/){s/^version = "[^"]+"$/version = "'"$VERSION"'"/; $d=1}' "$toml"
done

# --- Cross-crate houston-* dep pins in member Cargo.tomls --------------------
# A member crate may pin a sibling like
#   houston-engine-core = { version = "0.4.0", path = "../houston-engine-core" }
# Scoped on `path = "` exactly like the root pass below, so third-party pins
# stay untouched. Without this, a caret pin silently tolerates patch bumps and
# then breaks the release on the first MINOR bump (bit us at 0.4.26 -> 0.5.0:
# houston-engine-server pinned ^0.4.0 while the crates moved to 0.5.0).
for toml in app/src-tauri/Cargo.toml; do
  perl -i -pe 's/version = "[0-9]+\.[0-9]+\.[0-9]+"/version = "'"$VERSION"'"/ if /path = "/' "$toml"
done

# --- Root Cargo.toml workspace deps -----------------------------------------
# Bump only the houston-* path deps: every workspace member line carries
# `path = "…"`, while third-party pins like serde `version = "1"` do not, so
# scoping on `path = "` leaves them untouched. perl (not BSD `sed -i ''`) so
# the bump runs on Linux + Windows git-bash, not just macOS.
perl -i -pe 's/version = "[0-9]+\.[0-9]+\.[0-9]+"/version = "'"$VERSION"'"/ if /path = "/' Cargo.toml

# --- Cargo.lock ---------------------------------------------------------------
# The lock pins workspace-member versions too; without a regen the release
# build fails on the toml/lock mismatch (prior releases regenerated it by
# hand — now it's part of the bump). `cargo update --workspace` refreshes only
# the workspace members' entries.
if command -v cargo >/dev/null 2>&1; then
  cargo update --workspace --quiet
  echo "Cargo.lock regenerated for workspace members"
else
  echo "WARNING: cargo not found — Cargo.lock NOT regenerated; the release build will fail until it is" >&2
fi

echo "All packages bumped to v$VERSION"
