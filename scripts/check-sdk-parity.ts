import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  gatewayExport,
  listRoutes,
  readGateway,
  repoRoot,
  sdkMethods,
} from "./sdk-parity/inputs.ts";
import { checkRules, type Rule, type Violation } from "./sdk-parity/rules.ts";

/**
 * Does every route a signed-in human can reach have exactly one
 * `@houston/sdk` method, and does every SDK method reach a route some server
 * serves?
 *
 * PRINT-ONLY for now, and it always exits 0: the host's route registry holds
 * only the migrated routes, so most of the hand-written chain is invisible to
 * `listRoutes()` and rules 1 and 2 report large counts that shrink wave by wave
 * (PRODUCT-1820). Wave 7 turns this into a gate on `pnpm check`, once the
 * registry is complete.
 *
 * Run with tsx, not `node --experimental-strip-types`: the host's modules
 * import each other extensionlessly, which Node's ESM resolver refuses.
 */
const EXCEPTIONS = resolve(repoRoot, "scripts/sdk-parity-exceptions.json");

const RULES: Rule[] = [
  "sdk-route-unbound",
  "sdk-method-unserved",
  "route-served-twice",
  "proxy-drift",
];

interface Exception {
  rule: Rule;
  key: string;
  side: string;
  reason: string;
  issue?: string;
}

const host = listRoutes();
const gateway = readGateway();
if (!gateway)
  process.stderr.write(
    `WARNING: no gateway route export at ${gatewayExport}. The gateway's routes are NOT checked — point HOUSTON_CLOUD_ROOT at the cloud checkout. This is a blind spot, not a pass.\n`,
  );
const sdk = sdkMethods();
const violations = checkRules(host, gateway ?? [], sdk.routed);

const exceptions = JSON.parse(readFileSync(EXCEPTIONS, "utf8")) as {
  baseline: number;
  entries: Exception[];
};
const identity = (entry: { rule: Rule; key: string }) =>
  `${entry.rule} ${entry.key}`;
const excused = new Set(exceptions.entries.map(identity));
const reproduced = new Set(violations.map(identity));
const open = violations.filter(
  (violation) => !excused.has(identity(violation)),
);

const lines = [
  `SDK parity — ${host.length} host routes registered, ${gateway?.length ?? 0} gateway routes, ${sdk.routed.length} routed SDK methods (${sdk.unroutable.length} the extractor cannot route).`,
];
for (const rule of RULES) {
  const found = open.filter((violation: Violation) => violation.rule === rule);
  lines.push(`\n${rule}: ${found.length}`);
  for (const violation of found.slice(0, 20))
    lines.push(`  ${violation.message}`);
  if (found.length > 20) lines.push(`  … ${found.length - 20} more`);
}

const stale = exceptions.entries.filter(
  (entry) => !reproduced.has(identity(entry)),
);
const unreasoned = exceptions.entries.filter(
  (entry) => entry.reason.trim().length < 20,
);
lines.push(
  `\nexceptions: ${exceptions.entries.length} of a ${exceptions.baseline} baseline, ${stale.length} stale, ${unreasoned.length} without a written reason`,
);
for (const entry of stale)
  lines.push(`  exception for ${entry.key} no longer applies — delete it`);
for (const entry of unreasoned)
  lines.push(`  exception for ${entry.key} needs a reason saying why`);
process.stdout.write(`${lines.join("\n")}\n`);
