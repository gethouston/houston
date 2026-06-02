#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: ./scripts/version.sh <version>}"

echo "Bumping all packages to v$VERSION..."

# NPM packages — only the ones that share the Houston version line.
# ui/agent, ui/agent-schemas, ui/engine-client, ui/sync-protocol are
# versioned independently and are intentionally excluded.
for f in package.json app/package.json \
         ui/core/package.json ui/chat/package.json ui/board/package.json \
         ui/layout/package.json ui/skills/package.json ui/events/package.json \
         ui/routines/package.json ui/review/package.json; do
  # Surgical, EOL-preserving bump of ONLY the top-level "version" key.
  # Dependencies are keyed by package name (never literal "version"), so
  # the first `"version":` line is always the package's own. We do NOT
  # pipe through jq: the Windows jq build rewrites the file to CRLF and
  # reserializes the whole document, turning a 1-line bump into a 16-line
  # EOL-churn diff. perl edits one line in place and keeps LF.
  perl -i -pe 'if (!$d && s/("version":\s*")[0-9]+\.[0-9]+\.[0-9]+(")/${1}'"$VERSION"'${2}/) { $d=1 }' "$f"
done

# Rust crates — replace ONLY the first `^version = ...` line (the
# `[package]` version), not dependency lines like:
#   [dependencies.thiserror]
#   version = "1"
# which sed would otherwise clobber and break cargo resolution.
# Use perl instead of `1,/regex/s//new/` because BSD sed (macOS)
# rejects the empty back-reference with "first RE may not be empty".
for toml in engine/*/Cargo.toml app/houston-tauri/Cargo.toml app/src-tauri/Cargo.toml; do
  perl -i -pe 'BEGIN{$d=0} if(!$d && /^version = "[^"]+"$/){s/^version = "[^"]+"$/version = "'"$VERSION"'"/; $d=1}' "$toml"
done

# Root Cargo.toml workspace dependencies. Match only the houston-* path
# deps (every workspace member line carries `path = "…"`); third-party
# pins like `version = "1"` lack a path and are left untouched. Uses perl
# instead of BSD `sed -i ''` so the bump runs on Linux + Windows git-bash,
# not just macOS.
perl -i -pe 's/version = "[0-9]+\.[0-9]+\.[0-9]+"/version = "'"$VERSION"'"/ if /path = "/' Cargo.toml

echo "All packages bumped to v$VERSION"
