#!/usr/bin/env bash
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
