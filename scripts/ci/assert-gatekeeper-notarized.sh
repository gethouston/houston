#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <spctl args...> <path>" >&2
  exit 2
fi
TARGET="${*: -1}"

if ! OUT=$(spctl -a "$@" 2>&1); then
  echo "$OUT"
  echo "::error::Gatekeeper rejected $TARGET"
  exit 1
fi
echo "$OUT"
if ! grep -qx 'source=Notarized Developer ID' <<<"$OUT"; then
  echo "::error::Gatekeeper did not assess $TARGET as a notarized Developer ID item"
  exit 1
fi
