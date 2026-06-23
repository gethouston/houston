#!/usr/bin/env node
/**
 * Locks the open/closed seam between "Houston" (open) and "Houston Cloud"
 * (closed) so the eventual OSS split is a clean directory move. See BOUNDARY.md
 * for the manifest this script enforces.
 *
 * The seam is now a PACKAGE boundary (the in-host CLOSED_FILES/MIXED_FILES
 * machinery is gone — host-cloud was extracted):
 *
 *   - `packages/host-cloud/**` is the CLOSED package (the concrete cloud adapters
 *     pg / GCS / GKE / Redis / BigQuery, the operator-admin surface, and the
 *     cloud `main.ts`). It MAY import `@houston/host` and cloud libs freely.
 *   - `packages/host/**` is OPEN (the server builder, ports, every domain route
 *     handler, the open adapters, and the LOCAL entry). It must NEVER import a
 *     cloud lib or `@houston/host-cloud`.
 *   - The other open packages (protocol/domain/runtime/runtime-client, ui) must
 *     NEVER import a cloud lib or `@houston/host-cloud`.
 *
 * The one-way rule: CLOSED may import OPEN; OPEN must NEVER import CLOSED.
 *
 * Two rules, both fail the build (exit 1):
 *
 *   Rule A — no OPEN-package file imports a cloud lib or `@houston/host-cloud`.
 *     Open packages: packages/{protocol,domain,runtime,runtime-client,host}, ui/**.
 *     The ONE documented exception is the runtime's own cloud adapter
 *     (packages/runtime/src/turn/gcs-store.ts), reachable only from the runtime's
 *     wiring point (packages/runtime/src/main.ts) — the same port+adapter+wiring
 *     shape one level down.
 *
 *   Rule B — `packages/host-cloud/**` is wholesale CLOSED. It may import cloud
 *     libs and `@houston/host` (the one-way dependency). Nothing to forbid here;
 *     it is walked only to assert it never reaches BACK across a forbidden edge
 *     would be a future concern, but the host-cloud package is closed by
 *     definition, so Rule B is a no-op presence check (it must exist + contain
 *     the cloud adapters). The teeth are entirely in Rule A.
 *
 * No new npm deps: a regex import extractor over .ts/.tsx + node:fs.
 *
 * Run: node scripts/check-boundaries.mjs   (root script: pnpm check:boundaries)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// The manifest (must stay in sync with BOUNDARY.md).
// ---------------------------------------------------------------------------

/**
 * Open packages whose every file must be free of cloud (Rule A). Repo-relative.
 * `packages/host` is OPEN now — the closed cloud adapters live in the separate
 * `packages/host-cloud` package, which is NOT in this list.
 */
const OPEN_PACKAGES = [
  "packages/protocol",
  "packages/domain",
  "packages/runtime",
  "packages/runtime-client",
  "packages/host",
  "ui",
];

/** The closed package. Walked only to assert it exists + holds the adapters. */
const CLOSED_PACKAGE = "packages/host-cloud";

/**
 * Bare specifiers that are cloud-only. A `from "<lib>"` or `from "<lib>/..."`
 * is a cloud import. `redis` covers the bare client; `bigquery` guards the
 * @google-cloud/bigquery subpackage by name.
 */
const CLOUD_LIBS = [
  "pg",
  "ioredis",
  "redis",
  "@google-cloud/", // storage, bigquery, ...
  "@kubernetes/",
  "googleapis",
  "bigquery",
];

/** The closed package's import specifier — OPEN code may never import it. */
const CLOSED_PACKAGE_SPEC = "@houston/host-cloud";

/**
 * Files allowed to import a cloud lib from WITHIN an open package. The only one
 * left is the runtime's own cloud adapter + its wiring point: the runtime ships
 * to cloud too, so it carries a single GcsStore adapter behind the ObjectStore
 * port, constructed via a dynamic import() in the runtime's main.ts.
 * Repo-relative, no extension.
 */
const RUNTIME_CLOUD_ALLOWLIST = new Set([
  "packages/runtime/src/turn/gcs-store",
  "packages/runtime/src/main",
]);

// ---------------------------------------------------------------------------
// File walk + import extraction.
// ---------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dir may not exist (e.g. a package without src)
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.test\./.test(entry) &&
      // Test scaffolding (never shipped) may drive a closed adapter directly,
      // exactly like a *.test.ts file. Convention: *-harness, *.test-helper,
      // *.fixture, *.mock. Documented in BOUNDARY.md.
      !/[.-](harness|test-helper|fixture|mock)\.[jt]sx?$/.test(entry) &&
      !/\.d\.ts$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every import/export specifier in a source file: static `from "x"`,
 * `export ... from "x"`, side-effect `import "x"`, and dynamic `import("x")`.
 */
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function importsOf(src) {
  const specs = [];
  for (const m of src.matchAll(SPEC_RE)) specs.push(m[1]);
  return specs;
}

const noExt = (p) => p.replace(/\.(ts|tsx)$/, "");
const repoRel = (abs) => relative(root, abs).split("\\").join("/");

/** Is `spec` a cloud lib? Matches the bare lib or any subpath. */
function isCloudLib(spec) {
  return CLOUD_LIBS.some((lib) =>
    lib.endsWith("/")
      ? spec === lib.slice(0, -1) || spec.startsWith(lib)
      : spec === lib || spec.startsWith(`${lib}/`),
  );
}

/** Is `spec` an import of the closed host-cloud package (bare or subpath)? */
function isClosedPackage(spec) {
  return (
    spec === CLOSED_PACKAGE_SPEC || spec.startsWith(`${CLOSED_PACKAGE_SPEC}/`)
  );
}

// ---------------------------------------------------------------------------
// Rules.
// ---------------------------------------------------------------------------

const violations = [];
let openFilesChecked = 0;
let closedFilesChecked = 0;
let crossingsAllowed = 0;

// Rule A — open packages (incl. packages/host): no cloud lib, no @houston/host-cloud.
// The ONE exception is the runtime's own cloud adapter wiring.
for (const pkg of OPEN_PACKAGES) {
  for (const abs of walk(join(root, pkg))) {
    openFilesChecked++;
    const self = noExt(repoRel(abs));
    const runtimeAllowed = RUNTIME_CLOUD_ALLOWLIST.has(self);
    const src = readFileSync(abs, "utf8");
    for (const spec of importsOf(src)) {
      if (isCloudLib(spec)) {
        if (runtimeAllowed) {
          crossingsAllowed++;
          continue;
        }
        violations.push(
          `[A] ${repoRel(abs)} -> cloud lib "${spec}" (open package must not import cloud)`,
        );
        continue;
      }
      if (isClosedPackage(spec)) {
        // OPEN code may NEVER import the closed package — no allowlist.
        violations.push(
          `[A] ${repoRel(abs)} -> closed package "${spec}" (open code must never import @houston/host-cloud)`,
        );
      }
    }
  }
}

// Rule B — the closed package is wholesale CLOSED: it may import cloud libs and
// @houston/host (the one-way dependency). We walk it only to count its files and
// confirm it carries the cloud adapters (so a stray empty dir can't pass as
// "extracted"). Its cloud imports are all legitimate crossings.
for (const abs of walk(join(root, CLOSED_PACKAGE, "src"))) {
  closedFilesChecked++;
  const src = readFileSync(abs, "utf8");
  for (const spec of importsOf(src)) {
    if (isCloudLib(spec)) crossingsAllowed++;
  }
}

if (closedFilesChecked === 0) {
  violations.push(
    `[B] ${CLOSED_PACKAGE}/src has no source files — the closed package must hold the extracted cloud adapters`,
  );
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

if (violations.length > 0) {
  console.error("Boundary check FAILED — open/closed seam leak:\n");
  for (const v of violations.sort()) console.error(`  ${v}`);
  console.error(
    `\n${violations.length} violation(s). See BOUNDARY.md for the manifest.\n` +
      "Open code must never import a cloud lib or @houston/host-cloud; route the dependency through a port.",
  );
  process.exit(1);
}

console.log(
  `Boundary OK — ${openFilesChecked} open file(s) clean (incl. packages/host); ` +
    `${closedFilesChecked} closed file(s) in ${CLOSED_PACKAGE}; ` +
    `${crossingsAllowed} allowlisted cloud crossing(s).`,
);
