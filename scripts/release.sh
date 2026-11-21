#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: ./scripts/release.sh <version>}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be semver (e.g., 0.2.0)"
  exit 1
fi

echo "Releasing Houston v$VERSION..."

./scripts/version.sh "$VERSION"

echo "TODO: Update CHANGELOG.md with v$VERSION changes"

git add -A
git commit -m "release: v$VERSION"

git tag -a "v$VERSION" -m "Houston v$VERSION"

git push origin main --tags

echo "Publishing npm packages..."
for pkg in core chat board layout workspace skills connections events routines review memory; do
  (cd "ui/$pkg" && npm publish --access public)
done

echo "Creating GitHub release..."
gh release create "v$VERSION" \
  --title "Houston v$VERSION" \
  --generate-notes

echo "Released Houston v$VERSION"
