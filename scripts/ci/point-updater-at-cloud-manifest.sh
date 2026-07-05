#!/usr/bin/env bash
# Point the in-app updater at the CLOUD release channel's manifest.
#
# The desktop app ships two channels from this repo's releases:
#   - local build  (tag `v*`)       → `releases/latest/download/latest.json`
#   - cloud build  (tag `cloud-v*`) → `releases/download/cloud-latest/latest-cloud.json`
#
# A cloud app must NEVER read the local channel's `latest.json`: doing so would
# auto-update it into a LOCAL build, dropping the baked gateway URL and dumping
# the user back on the connection chooser (and symmetrically a local app must
# not read a cloud manifest). The two channels' manifests are distinct release
# assets, so neither can ever feed the other — the worst case is "no update
# found", never a wrong-channel update.
#
# The cloud endpoint is pinned to the fixed tag `cloud-latest` rather than the
# `/latest/` alias because cloud releases are PRERELEASES (so they can never
# become GitHub's "latest release" and shadow the local channel's endpoint) —
# and `/latest/` only ever resolves to non-prereleases, so a
# `releases/latest/download/latest-cloud.json` URL would permanently 404.
# The `cloud-latest` rolling release is maintained by
# .github/workflows/cloud-updater-manifest.yml, which copies the published
# cloud release's `latest-cloud.json` onto it on every `cloud-v*` publish.
#
# Edits ONLY the runner's checkout of tauri.conf.json — never committed. Uses
# Node (present on every GitHub runner, including windows-11-arm where jq is
# not), mirroring configure-ts-engine-unsigned.sh.
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
