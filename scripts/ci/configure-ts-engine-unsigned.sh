#!/usr/bin/env bash
# Configure an UNSIGNED test build of the TS-engine desktop app.
#
# This repo has no code-signing / updater secrets, and these artifacts are
# internal engine-test builds that are never shipped through the auto-updater.
# So turn OFF Tauri updater-artifact creation: otherwise `tauri build` (which
# sees bundle.createUpdaterArtifacts: true) demands an updater signing key and
# dies with "failed to decode secret key: ... Missing comment in secret key".
# macOS separately falls back to the ad-hoc `signingIdentity: "-"` already in
# tauri.conf.json (we pass no APPLE_CERTIFICATE, so no keychain import is tried).
#
# Edits ONLY the runner's checkout of tauri.conf.json — never committed. Uses
# Node (present on every GitHub runner, including windows-11-arm where jq is not)
# so the same script works untouched on macOS, Linux, and both Windows runners.
set -euo pipefail

CONF="app/src-tauri/tauri.conf.json"
[ -f "$CONF" ] || { echo "::error::$CONF not found (run this from the repo root)"; exit 1; }

node -e '
const fs = require("fs");
const p = process.argv[1];
const c = JSON.parse(fs.readFileSync(p, "utf8"));
c.bundle = c.bundle || {};
c.bundle.createUpdaterArtifacts = false;
fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
' "$CONF"

echo "Configured unsigned test build: bundle.createUpdaterArtifacts = false"
