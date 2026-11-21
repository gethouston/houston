#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
SOURCE_REF="${CACHE_PROVENANCE_SOURCE_REF:-refs/heads/main}"
SIGNER_WORKFLOW="$REPO/.github/workflows/release-cache-warm.yml"

if [ "$#" -eq 0 ]; then
  echo "ERROR: no files to verify" >&2
  exit 1
fi

status=0
for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "provenance FAILED: $file does not exist" >&2
    status=1
    continue
  fi
  if gh attestation verify "$file" \
      --repo "$REPO" \
      --signer-workflow "$SIGNER_WORKFLOW" \
      --source-ref "$SOURCE_REF"; then
    echo "provenance OK: $file (signed by $SIGNER_WORKFLOW on $SOURCE_REF)"
  else
    echo "provenance FAILED: $file is not attested by $SIGNER_WORKFLOW on $SOURCE_REF" >&2
    status=1
  fi
done
exit "$status"
