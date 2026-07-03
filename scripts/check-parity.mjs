#!/usr/bin/env node
/**
 * Cross-surface component parity gate. Mirrors scripts/check-boundaries.mjs: a
 * secret-free, dependency-light node script that collects every violation and
 * fails the build (exit 1) if any survive. Wired as `pnpm check:parity` and run
 * in CI alongside `pnpm check:boundaries`.
 *
 * WHAT IT GUARDS (see design/inventory/README.md for the full contract):
 *
 *   design/inventory/inventory.yaml   -- the versioned cross-surface spec
 *   design/inventory/CHANGELOG.md     -- one entry per version bump
 *   design/inventory/manifests/*.yaml -- per-surface implementation status
 *
 * HARD FAILS (exit 1):
 *   - inventory.yaml / manifests must parse and match the schema precisely
 *     (unknown keys and typo'd statuses fail, not pass silently);
 *   - a manifest may only reference components that exist in the inventory;
 *   - every inventory component must have an entry in every manifest;
 *   - an ENFORCED surface at inventoryVersion N may not leave any component
 *     with since <= N `not-started` (or missing);
 *   - a manifest may not claim an inventoryVersion beyond the inventory's;
 *   - a `version` bump must be accompanied by a matching CHANGELOG.md entry.
 *
 * REPORT (never fails): the lag of the UNENFORCED surfaces (native apps) so
 * their progress is visible in every CI run.
 *
 * The validation logic is factored into scripts/parity/* and exported here as
 * `checkParity(dir)` so it is unit-testable against fixtures
 * (scripts/check-parity.test.mjs) without shelling out.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChangelog, loadInventory, loadManifests } from "./parity/load.mjs";
import { validateManifest } from "./parity/manifest.mjs";
import { buildReport } from "./parity/report.mjs";
import { validateChangelog, validateInventory } from "./parity/validate.mjs";

/**
 * Run every check against an inventory directory (containing inventory.yaml,
 * CHANGELOG.md and manifests/). Returns { violations, report } and never throws
 * on bad content -- malformed files become violations.
 */
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

  const parsed = manifests.filter(
    (m) => m.value && typeof m.value === "object",
  );
  const report = buildReport(parsed, sinceById, version);
  return { violations, report };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "design", "inventory");
  const { violations, report } = checkParity(dir);

  if (report) console.log(`${report}\n`);

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
