#!/usr/bin/env bash
set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    -*) continue ;;
    *houston-engine* | *claude*)
      printf '\tnot a dynamic executable\n'
      exit 0
      ;;
  esac
done

exec /usr/bin/ldd "$@"
