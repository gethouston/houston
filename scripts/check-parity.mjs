#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChangelog, loadInventory, loadManifests } from "./parity/load.mjs";
import { validateManifest } from "./parity/manifest.mjs";
import { validateChangelog, validateInventory } from "./parity/validate.mjs";

export function checkParity(dir) {
  const violations = [];

  const inv = loadInventory(dir);
  if (inv.problem) violations.push(`[inventory] ${inv.problem}`);

  const {
    violations: invViolations,
    version,
    sinceById,
  } = inv.value
    ? validateInventory(inv.value)
    : { violations: [], version: null, sinceById: new Map() };
  violations.push(...invViolations);

  const changelog = loadChangelog(dir);
  if (changelog.problem) violations.push(`[changelog] ${changelog.problem}`);
  else violations.push(...validateChangelog(changelog.value, version));

  const manifests = loadManifests(dir);
  for (const m of manifests) {
    if (m.problem) violations.push(`[${m.label ?? m.name}] ${m.problem}`);
    else violations.push(...validateManifest(m, sinceById, version));
  }

  return { violations };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "design", "inventory");
  const { violations } = checkParity(dir);

  if (violations.length > 0) {
    console.error(
      "Parity check FAILED — the component inventory and manifests are out of sync:\n",
    );
    for (const v of violations.sort()) console.error(`  ${v}`);
    console.error(
      `\n${violations.length} violation(s). See design/inventory/README.md for the contract.\n` +
        "A cross-surface component change must bump inventory.yaml, add a CHANGELOG entry, and update every enforced manifest in the same PR.",
    );
    process.exit(1);
  }

  console.log(
    "Parity OK — inventory, changelog and all surface manifests are consistent.",
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main();
