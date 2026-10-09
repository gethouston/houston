#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'Usage: make-upload-keystore.sh <output-keystore-path> <key-alias>' >&2
  exit 2
fi
keystore=$1
alias_name=$2
if [[ -e "$keystore" ]]; then
  echo "Refusing to replace existing keystore: $keystore" >&2
  exit 1
fi
umask 077
keytool -genkeypair -keystore "$keystore" -storetype PKCS12 -alias "$alias_name" -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=Houston Upload, O=Houston' -v
printf '\nANDROID_UPLOAD_KEYSTORE_B64 (keep private):\n'
base64 < "$keystore" | tr -d '\n'
printf '\n\nSHA-256 and SHA-1 fingerprints:\n'
keytool -list -v -keystore "$keystore" -alias "$alias_name" | grep -E '^[[:space:]]*(SHA1|SHA256):'
