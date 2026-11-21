#!/usr/bin/env bash
set -euo pipefail

CONF="app/src-tauri/tauri.conf.json"
[ -f "$CONF" ] || { echo "::error::$CONF not found (run this from the repo root)"; exit 1; }

node -e '
const fs = require("fs");
const p = process.argv[1];
const c = JSON.parse(fs.readFileSync(p, "utf8"));
const eps = c && c.plugins && c.plugins.updater && c.plugins.updater.endpoints;
if (!Array.isArray(eps) || eps.length === 0) {
  console.error("::error::plugins.updater.endpoints missing — cannot repoint the cloud updater");
  process.exit(1);
}
const next = eps.map((u) =>
  u.replace(/releases\/latest\/download\/latest\.json$/, "releases/download/cloud-latest/latest-cloud.json")
);
if (next.every((u, i) => u === eps[i])) {
  console.error("::error::no endpoint matched releases/latest/download/latest.json — refusing to ship a cloud build on the local updater feed");
  process.exit(1);
}
c.plugins.updater.endpoints = next;
fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
console.log("Cloud updater endpoints: " + next.join(", "));
' "$CONF"
