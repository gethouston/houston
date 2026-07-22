#!/usr/bin/env bash
# Neutralize the in-app updater for the STAGING QA flavor of a cloud build.
#
# The staging macOS DMG is a QA-only sibling of the prod cloud DMG: same commit,
# same build pipeline, same signing + notarization — it differs ONLY in the baked
# gateway URL (HOSTED_ENGINE_URL_STAGING instead of HOSTED_ENGINE_URL) and in this
# updater rewrite. It exists so we can test the EXACT shipped binary against the
# staging engine fleet before that engine is promoted to prod and the draft is
# published. It must NEVER enter any updater manifest (latest-cloud.json),
# checksums file, or Sentry upload.
#
# Why point the updater at a tag that will never exist:
#   The prod cloud flavor repoints the updater at `latest-cloud.json` (see
#   point-updater-at-cloud-manifest.sh), which the app checks AT LAUNCH. If the
#   staging build kept that endpoint, its first launch would find the published
#   PROD build advertised there and force-update the staging install straight into
#   prod — the staging install would evaporate before anyone could QA it. So we
#   instead point the updater at the fixed tag `staging-noop`, a release that is
#   NEVER created. Every update check 404s forever, so the staging install stays
#   put.
#
#   This is safe because the app's update check is fail-open:
#   app/src/hooks/use-update-machine.ts catches check errors and only
#   console.warns — a 404 never blocks launch, it just means "no update found".
#   The staging DMG therefore keeps talking to the staging gateway for the whole
#   QA session, exactly as intended.
#
# Edits ONLY the runner's checkout of tauri.conf.json — never committed. Uses Node
# (present on every GitHub runner, including windows-11-arm where jq is not),
# mirroring point-updater-at-cloud-manifest.sh + configure-ts-engine-unsigned.sh.
set -euo pipefail

CONF="app/src-tauri/tauri.conf.json"
[ -f "$CONF" ] || { echo "::error::$CONF not found (run this from the repo root)"; exit 1; }

node -e '
const fs = require("fs");
const p = process.argv[1];
const c = JSON.parse(fs.readFileSync(p, "utf8"));
const eps = c && c.plugins && c.plugins.updater && c.plugins.updater.endpoints;
if (!Array.isArray(eps) || eps.length === 0) {
  console.error("::error::plugins.updater.endpoints missing — cannot neutralize the staging updater");
  process.exit(1);
}
const DEAD = "https://github.com/gethouston/houston/releases/download/staging-noop/latest-staging.json";
const next = eps.map((u) =>
  u.replace(/releases\/latest\/download\/latest\.json$/, "releases/download/staging-noop/latest-staging.json")
);
if (next.every((u, i) => u === eps[i])) {
  console.error("::error::no endpoint matched releases/latest/download/latest.json — refusing to ship a staging build on the live updater feed");
  process.exit(1);
}
c.plugins.updater.endpoints = next;
fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
console.log("Staging updater neutralized — endpoints point at the never-created tag: " + DEAD);
' "$CONF"
