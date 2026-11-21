#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <campaign_slug> [content_slug]"
  echo "  campaign_slug: e.g. yc_demo_day_2026 (lowercase, snake_case, with year)"
  echo "  content_slug:  optional placement, e.g. qr_table_tent (defaults to qr_main)"
  exit 1
fi

CAMPAIGN="$1"
CONTENT="${2:-qr_main}"

if ! command -v qrencode >/dev/null 2>&1; then
  echo "Error: qrencode not installed. Run 'brew install qrencode' (macOS) or 'apt install qrencode' (Linux)."
  exit 1
fi

for slug in "$CAMPAIGN" "$CONTENT"; do
  if [[ ! "$slug" =~ ^[a-z0-9_]+$ ]]; then
    echo "Error: '$slug' must be lowercase snake_case (a-z, 0-9, _ only)."
    echo "See growth/utm-conventions.md."
    exit 1
  fi
done

URL="https://gethouston.ai/?utm_source=qr_code&utm_medium=event&utm_campaign=${CAMPAIGN}&utm_content=${CONTENT}"
OUTPUT="${CAMPAIGN}-${CONTENT}.png"

qrencode -s 16 -m 4 -l H -o "$OUTPUT" "$URL"

echo "✓ Generated $OUTPUT"
echo "  URL: $URL"
echo ""
echo "Print this at >= 4cm × 4cm so phones can scan from arm's length."
echo "Print the human-readable URL underneath too (some phones still can't QR)."
