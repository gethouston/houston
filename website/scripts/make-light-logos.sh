#!/bin/sh
set -eu
src=src/assets/img/enterprise/logos
out=src/assets/img/enterprise/logos-light
mkdir -p "$out"
for f in "$src"/*.png; do
  ffmpeg -loglevel error -y -i "$f" -vf \
    "format=rgba,geq=r='255':g='255':b='255':a='min(255,alpha(X,Y)*(255-(0.299*r(X,Y)+0.587*g(X,Y)+0.114*b(X,Y)))/200)'" \
    "$out/$(basename "$f")"
done
echo "light logos: $(ls "$out" | wc -l)"
