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
 * It runs on every `pnpm check` (`check:sdk-parity`) so the report is read
 * rather than remembered, but the four RULES are PRINT-ONLY: the host's route
 * registry holds only the migrated routes, so most of the hand-written chain is
 * invisible to `listRoutes()` and rules 1 and 2 report large counts that shrink
 * wave by wave (PRODUCT-1820). Wave 7 makes an open violation exit non-zero,
 * once the registry is complete. The exceptions FILE is already enforced: its
 * shape and its baseline do not depend on how far the migration has got.
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

/** One written excuse. `key` is the violation identity `rule + " " + key`. */
interface Exception {
  rule: Rule;
  key: string;
  reason: string;
}

interface Exceptions {
  baseline: number;
  entries: Exception[];
}

const isRule = (value: unknown): value is Rule => RULES.includes(value as Rule);

/**
 * Read the exceptions file, or throw. Its own shape is checked HERE rather
 * than trusted: a typo'd `rule` would otherwise excuse nothing while reading
 * like an accepted debt, and `baseline` is the only number this gate cannot
 * recompute — a file that disagrees with itself must stop the process even
 * while the parity rules themselves are still print-only.
 */
function readExceptions(): Exceptions {
  const parsed: unknown = JSON.parse(readFileSync(EXCEPTIONS, "utf8"));
  const problems: string[] = [];
  const file = parsed as Partial<Exceptions>;
  if (typeof file?.baseline !== "number" || !Array.isArray(file.entries))
    throw new Error(
      `${EXCEPTIONS}: needs a numeric baseline and an entries array`,
    );
  for (const [index, entry] of file.entries.entries()) {
    const at = `entries[${index}]`;
    if (!isRule(entry?.rule))
      problems.push(
        `${at}.rule "${entry?.rule}" is not one of ${RULES.join(", ")}`,
      );
    if (typeof entry?.key !== "string" || !entry.key.trim())
      problems.push(`${at}.key must name the violation it excuses`);
    if (typeof entry?.reason !== "string" || entry.reason.trim().length < 20)
      problems.push(
        `${at}.reason must say WHY parity stops here (20+ characters)`,
      );
    for (const extra of Object.keys(entry ?? {}))
      if (!["rule", "key", "reason"].includes(extra))
        problems.push(`${at}.${extra} is not a field of an exception`);
  }
  if (file.entries.length > file.baseline)
    problems.push(
      `${file.entries.length} entries exceed the ${file.baseline} baseline — raising it is a deliberate, reviewable diff`,
    );
  if (problems.length)
    throw new Error(`${EXCEPTIONS}:\n  ${problems.join("\n  ")}`);
  return { baseline: file.baseline, entries: file.entries };
}

const host = listRoutes();
const gateway = readGateway();
if (!gateway)
  process.stderr.write(
    `WARNING: no gateway route export at ${gatewayExport}. The gateway's routes are NOT checked — point HOUSTON_CLOUD_ROOT at the cloud checkout. This is a blind spot, not a pass.\n`,
  );
const sdk = sdkMethods();
const violations = checkRules(host, gateway ?? [], sdk.routed);

const exceptions = readExceptions();
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

// Staleness is the one exception check that is NOT a hard failure: a violation
// stops reproducing as the migration waves land, and the entry is deleted in
// the wave that fixed it rather than in whichever run first noticed.
const stale = exceptions.entries.filter(
  (entry) => !reproduced.has(identity(entry)),
);
lines.push(
  `\nexceptions: ${exceptions.entries.length} of a ${exceptions.baseline} baseline, ${stale.length} stale`,
);
for (const entry of stale)
  lines.push(`  exception for ${entry.key} no longer applies — delete it`);
process.stdout.write(`${lines.join("\n")}\n`);
