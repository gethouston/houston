#!/usr/bin/env bash
#
# Refresh the vendored Linear GraphQL schema.
#
# Pins schema/linear.graphql to whatever Linear's public endpoint currently
# advertises. The vendored copy gates cynic-codegen — schema drift is then
# an explicit diff PR (run this, inspect, commit), never a silent break
# between Linear's API changes and our build.
#
# Usage:
#   bash scripts/refresh-linear-schema.sh
#
# Requirements:
#   - bun (already a Houston build requirement; provides `bun x`)
#   - curl
#
# Output:
#   engine/houston-linear/schema/linear.graphql
#
# Suggested workflow:
#   1. bash scripts/refresh-linear-schema.sh
#   2. git diff engine/houston-linear/schema/linear.graphql
#   3. If anything broke cynic-codegen, audit the affected queries/mutations.
#   4. Commit with a `chore(linear): refresh vendored schema` conventional
#      message, body summarizes the diff (added/removed/changed types).

set -euo pipefail

SCHEMA_DIR="engine/houston-linear/schema"
SCHEMA_FILE="${SCHEMA_DIR}/linear.graphql"
LINEAR_ENDPOINT="https://api.linear.app/graphql"

# Resolve repo root regardless of where the script is invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

mkdir -p "${SCHEMA_DIR}"

echo "→ fetching SDL from ${LINEAR_ENDPOINT}..."
TMP="$(mktemp)"
if ! bun x get-graphql-schema "${LINEAR_ENDPOINT}" > "${TMP}" 2>/dev/null; then
  echo "ERR: bun x get-graphql-schema failed. Check network + bun install." >&2
  rm -f "${TMP}"
  exit 1
fi

LINES=$(wc -l < "${TMP}" | tr -d ' ')
if [ "${LINES}" -lt 1000 ]; then
  echo "ERR: SDL came back too small (${LINES} lines) — refusing to overwrite vendored schema." >&2
  echo "Inspect ${TMP} manually before committing." >&2
  exit 1
fi

mv "${TMP}" "${SCHEMA_FILE}"
echo "✓ wrote ${SCHEMA_FILE} (${LINES} lines)"

echo ""
echo "Next:"
echo "  git diff ${SCHEMA_FILE} | less"
echo "  (review then commit if cynic-codegen still builds:"
echo "    cargo check -p houston-linear"
echo "  )"
