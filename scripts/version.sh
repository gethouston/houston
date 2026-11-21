#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: ./scripts/version.sh <version>}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver (e.g. 0.4.19), got: $VERSION" >&2
  exit 1
fi

echo "Bumping all packages to v$VERSION..."

for f in package.json app/package.json \
         ui/core/package.json ui/chat/package.json ui/board/package.json \
         ui/layout/package.json ui/skills/package.json ui/events/package.json \
         ui/routines/package.json ui/review/package.json; do
  perl -i -pe 'BEGIN{$d=0} if(!$d && s/("version":\s*")[0-9]+\.[0-9]+\.[0-9]+(")/${1}'"$VERSION"'${2}/){$d=1}' "$f"
done

for toml in app/src-tauri/Cargo.toml; do
  perl -i -pe 'BEGIN{$d=0} if(!$d && /^version = "[^"]+"$/){s/^version = "[^"]+"$/version = "'"$VERSION"'"/; $d=1}' "$toml"
done

for toml in app/src-tauri/Cargo.toml; do
  perl -i -pe 's/version = "[0-9]+\.[0-9]+\.[0-9]+"/version = "'"$VERSION"'"/ if /path = "/' "$toml"
done

perl -i -pe 's/version = "[0-9]+\.[0-9]+\.[0-9]+"/version = "'"$VERSION"'"/ if /path = "/' Cargo.toml

if command -v cargo >/dev/null 2>&1; then
  cargo update --workspace --quiet
  echo "Cargo.lock regenerated for workspace members"
else
  echo "WARNING: cargo not found — Cargo.lock NOT regenerated; the release build will fail until it is" >&2
fi

echo "All packages bumped to v$VERSION"
