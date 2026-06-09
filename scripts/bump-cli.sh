#!/usr/bin/env bash
set -euo pipefail

# Bump a CLI dependency version in cli-deps.json.
#
# Usage:
#   ./scripts/bump-cli.sh codex 0.122.0
#   ./scripts/bump-cli.sh composio 0.2.25
#   ./scripts/bump-cli.sh claude-code 2.2.0

CLI="${1:?Usage: ./scripts/bump-cli.sh <cli-name> <version>}"
VERSION="${2:?Usage: ./scripts/bump-cli.sh <cli-name> <version>}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPS_FILE="$REPO_ROOT/cli-deps.json"

# Validate CLI exists in deps file. Pass values as jq --arg variables (never
# interpolate "$CLI" into the filter) so a name with quotes or brackets can't
# break the program.
if ! jq -e --arg cli "$CLI" '.[$cli]' "$DEPS_FILE" > /dev/null 2>&1; then
  echo "ERROR: '$CLI' not found in cli-deps.json" >&2
  echo "Available: $(jq -r 'keys[] | select(startswith("$") | not)' "$DEPS_FILE" | tr '\n' ' ')" >&2
  exit 1
fi

OLD_VERSION=$(jq -r --arg cli "$CLI" '.[$cli].version' "$DEPS_FILE")

# Update the version and clear the now-stale checksums in ONE jq pass, then
# normalize line endings to LF. jq is the right tool for this nested,
# CLI-scoped edit, but the Windows jq build writes CRLF; stripping the
# trailing CR makes the output byte-identical on macOS, Linux, and Windows
# git-bash (and keeps the repo's LF-only rule). On macOS/Linux the perl
# filter is a no-op (no CR present).
jq --arg cli "$CLI" --arg v "$VERSION" \
  '.[$cli].version = $v | .[$cli].checksums = {}' "$DEPS_FILE" \
  | perl -pe 's/\r$//' > tmp.json && mv tmp.json "$DEPS_FILE"

echo "Bumped $CLI: $OLD_VERSION -> $VERSION"
echo "Checksums cleared — run ./scripts/fetch-cli-deps.sh to download and compute new checksums"
echo ""
echo "Don't forget to:"
echo "  1. Run: ./scripts/fetch-cli-deps.sh"
echo "  2. Update checksums in cli-deps.json with the values printed by fetch"
echo "  3. Test the build before releasing"
