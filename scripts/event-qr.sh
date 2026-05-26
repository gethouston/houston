#!/usr/bin/env bash
# Generate a QR PNG that points at gethouston.ai with UTM params baked in.
#
# Usage:
#   ./scripts/event-qr.sh <campaign_slug> [content_slug]
#
# Examples:
#   ./scripts/event-qr.sh yc_demo_day_2026 qr_table_tent
#   ./scripts/event-qr.sh paris_meetup_2026_01 qr_poster
#
# Output: <campaign_slug>-<content_slug>.png in the current directory.
#
# Convention: UTMs follow growth/utm-conventions.md. utm_source=qr_code,
# utm_medium=event, utm_campaign=<arg1>, utm_content=<arg2>.
#
# Dependencies:
#   - `qrencode` (brew install qrencode)

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

# Validate slugs are lowercase snake_case per growth/utm-conventions.md
for slug in "$CAMPAIGN" "$CONTENT"; do
  if [[ ! "$slug" =~ ^[a-z0-9_]+$ ]]; then
    echo "Error: '$slug' must be lowercase snake_case (a-z, 0-9, _ only)."
    echo "See growth/utm-conventions.md."
    exit 1
  fi
done

URL="https://gethouston.ai/?utm_source=qr_code&utm_medium=event&utm_campaign=${CAMPAIGN}&utm_content=${CONTENT}"
OUTPUT="${CAMPAIGN}-${CONTENT}.png"

# -s 16: 16px per QR module → big enough for printed material
# -m 4 : 4-module quiet zone around the code (required for reliable scanning)
# -l H : high error correction → still scans if a corner gets scuffed
qrencode -s 16 -m 4 -l H -o "$OUTPUT" "$URL"

echo "✓ Generated $OUTPUT"
echo "  URL: $URL"
echo ""
echo "Print this at >= 4cm × 4cm so phones can scan from arm's length."
echo "Print the human-readable URL underneath too (some phones still can't QR)."
