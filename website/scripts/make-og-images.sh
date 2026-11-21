#!/bin/sh
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
tries=0
until curl -sf "http://127.0.0.1:$port/" >/dev/null; do
  tries=$((tries + 1))
  [ "$tries" -lt 100 ] || { echo "static server did not start" >&2; exit 1; }
  sleep 0.1
done

for card in home:/ enterprise:/enterprise/; do
  name=${card%%:*}
  path=${card#*:}
  for lang in en es pt; do
    prefix=/$lang
    [ "$lang" = en ] && prefix=
    url="http://127.0.0.1:$port$prefix$path"
    curl -sf "$url" >/dev/null || { echo "$url is not a page" >&2; exit 1; }
    rm -f "$tmp/shot.png"
    "$chrome" --headless=new --disable-gpu --hide-scrollbars \
      --force-prefers-reduced-motion --force-device-scale-factor=2 \
      --window-size=1200,630 --virtual-time-budget=5000 \
      --screenshot="$tmp/shot.png" "$url" 2>/dev/null
    [ -s "$tmp/shot.png" ] || { echo "no capture of $url" >&2; exit 1; }
    ffmpeg -loglevel error -y -i "$tmp/shot.png" \
      -vf scale=1200:630:flags=lanczos -q:v 3 "$out/$name-$lang.jpg"
    echo "$out/$name-$lang.jpg"
  done
done
