#!/bin/sh
# Builds the share cards in src/og/ that Slack, WhatsApp, LinkedIn, X and
# iMessage show for a pasted link: the first 1200x630 of a page as it renders
# today, one card per page and language (<card>-<lang>.jpg). Every page uses
# the `home` card of its language unless its front matter names another one
# (`ogCard`). _data/og.js puts a hash of each file in the card URL, so a
# changed card replaces the cached one on every platform that unfurled it.
#
# Re-run after changing the hero of the landing or /enterprise, then commit the
# JPEGs. Needs Google Chrome (or CHROME=<path>), ffmpeg and python3. Run from
# website/:
#   sh scripts/make-og-images.sh
set -eu
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
out=src/og
mkdir -p "$out"
npm run build >/dev/null

port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 -m http.server "$port" --bind 127.0.0.1 -d _site >/dev/null 2>&1 &
server=$!
tmp=$(mktemp -d)
trap 'kill "$server"; wait "$server" 2>/dev/null || true; rm -rf "$tmp"' EXIT
until curl -sf "http://127.0.0.1:$port/" >/dev/null; do sleep 0.1; done

for card in home:/ enterprise:/enterprise/; do
  name=${card%%:*}
  path=${card#*:}
  for lang in en es pt; do
    prefix=/$lang
    [ "$lang" = en ] && prefix=
    # Reduced motion: the landing hero pre-hides its pieces for a GSAP entrance
    # and only skips it when motion is reduced, so this is the settled frame.
    # Captured at 2x and scaled down so the text stays sharp at 1200 wide.
    "$chrome" --headless=new --disable-gpu --hide-scrollbars \
      --force-prefers-reduced-motion --force-device-scale-factor=2 \
      --window-size=1200,630 --virtual-time-budget=5000 \
      --screenshot="$tmp/shot.png" "http://127.0.0.1:$port$prefix$path" 2>/dev/null
    ffmpeg -loglevel error -y -i "$tmp/shot.png" \
      -vf scale=1200:630:flags=lanczos -q:v 3 "$out/$name-$lang.jpg"
    echo "$out/$name-$lang.jpg"
  done
done
