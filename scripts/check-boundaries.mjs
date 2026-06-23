#!/usr/bin/env node
/**
 * Locks the open/closed seam between the future "Houston" (open, local stack)
 * and "Houston Cloud" (closed, cloud adapters + admin) repos. See BOUNDARY.md
 * for the manifest this script enforces.
 *
 * The seam is the hexagonal ports boundary. The one-way rule:
 *
 *   CLOSED may import OPEN.   OPEN must NEVER import CLOSED.
 *
 * "Closed" = a concrete cloud adapter (pg / GCS / GKE / Redis / BigQuery) or
 * the operator-admin surface. "Open" = the pure/local stack (protocol, domain,
 * runtime, runtime-client, ui) plus the host's router, ports, domain handlers,
 * and local profile. Every legitimate crossing happens at a single wiring point
 * (`main.ts`) which is allowlisted; anything else is a leak.
 *
 * Two rules, both fail the build (exit 1):
 *
 *   Rule A — no OPEN-package file imports a cloud lib or a closed-destined file.
 *     Open packages: packages/{protocol,domain,runtime,runtime-client}, ui/**.
 *     The ONE documented exception is the runtime's own cloud adapter
 *     (packages/runtime/src/turn/gcs-store.ts), reachable only from the
 *     runtime's wiring point (packages/runtime/src/main.ts) — the same
 *     port+adapter+wiring shape one level down.
 *
 *   Rule B — within packages/control-plane (the host), only an allowlist may
 *     import a closed-destined adapter file. Allowlist = src/main.ts (the
 *     wiring point), the closed files themselves (intra-closed imports), the
 *     admin surface (admin/**), and routes/admin.ts (the admin route). Every
 *     other host file (routes/**, domain/**, schedule/**, ports.ts, channel/**,
 *     events/**, watch/**, local/**) importing a concrete cloud adapter is a
 *     violation.
 *
 * No new npm deps: a regex import extractor over .ts/.tsx + node:fs.
 *
 * Run: node scripts/check-boundaries.mjs   (root script: pnpm check:boundaries)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// The manifest (must stay in sync with BOUNDARY.md).
// ---------------------------------------------------------------------------

/** Packages whose every file must be free of cloud (Rule A). Repo-relative. */
const OPEN_PACKAGES = [
  "packages/protocol",
  "packages/domain",
  "packages/runtime",
  "packages/runtime-client",
  "ui",
];

/** The host package that Rule B governs internally. */
const HOST = "packages/control-plane";

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

/**
 * Closed-destined files (repo-relative, no extension). These ship to Houston
 * Cloud. OPEN code may never import them; inside the host only the allowlist
 * may. Each is a single-purpose cloud adapter or part of the admin surface.
 */
const CLOSED_FILES = new Set([
  // control-plane cloud adapters
  "packages/control-plane/src/store/pg",
  "packages/control-plane/src/integrations/credential-store-pg",
  "packages/control-plane/src/vfs/gcs",
  "packages/control-plane/src/launcher/gke",
  "packages/control-plane/src/launcher/reconcile",
  "packages/control-plane/src/launcher/manifest",
  "packages/control-plane/src/turn/bus-redis",
  // control-plane operator-admin surface (closed)
  "packages/control-plane/src/admin/billing",
  "packages/control-plane/src/admin/cluster",
  "packages/control-plane/src/admin/overview",
  "packages/control-plane/src/admin/quantity",
  // runtime's own cloud adapter (closed within the open package)
  "packages/runtime/src/turn/gcs-store",
]);

/**
 * MIXED files: a single module that exports BOTH an open and a closed symbol,
 * so it can't be cleanly placed on one side yet. Tolerated for now, tracked in
 * BOUNDARY.md "Wave-5 split TODO", and REMOVED from this set when host-cloud is
 * extracted (each splits into an open file + a closed file). They are NOT
 * closed (open code may import their open exports) and NOT violations — but the
 * check still surfaces them in the success line so they stay visible.
 *
 *   credentials/store.ts — MemoryCredentialStore (open) + PgCredentialStore
 *                          (closed, `import type { Pool } from "pg"`).
 *   vfs/index.ts         — barrel re-exporting FsVfs/MemoryVfs (open) + GcsVfs
 *                          (closed).
 */
const MIXED_FILES = new Set([
  "packages/control-plane/src/credentials/store",
  "packages/control-plane/src/vfs/index",
]);

/**
 * Files allowed to import a closed-destined file. The wiring points plus the
 * closed surface itself (intra-closed imports are fine; they all move
 * together). Repo-relative, no extension.
 */
const IMPORT_ALLOWLIST = new Set([
  // host wiring point — the one legitimate place cloud adapters are constructed
  "packages/control-plane/src/main",
  // the admin route is part of the closed admin surface
  "packages/control-plane/src/routes/admin",
  // runtime wiring point — constructs GcsStore behind a dynamic import
  "packages/runtime/src/main",
]);

/** True if `repoRelNoExt` is allowed to import a closed file (Rule B/A allow). */
function isAllowlisted(repoRelNoExt) {
  if (IMPORT_ALLOWLIST.has(repoRelNoExt)) return true;
  // intra-closed: a closed file importing another closed file is fine.
  if (CLOSED_FILES.has(repoRelNoExt)) return true;
  // a mixed file IS the closed half pre-split; it carries its own cloud import.
  if (MIXED_FILES.has(repoRelNoExt)) return true;
  // the whole admin surface is closed; admin/** may import admin/** + adapters.
  if (repoRelNoExt.startsWith("packages/control-plane/src/admin/")) return true;
  return false;
}

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

/**
 * Resolve a relative import to a repo-relative path (no extension) so we can
 * test it against CLOSED_FILES. Returns null for bare/package specifiers.
 */
function resolveRelative(fromAbs, spec) {
  if (!spec.startsWith(".")) return null;
  const abs = resolve(dirname(fromAbs), spec);
  return noExt(repoRel(abs));
}

// ---------------------------------------------------------------------------
// Rules.
// ---------------------------------------------------------------------------

const violations = [];
let openFilesChecked = 0;
let hostFilesChecked = 0;
let crossingsAllowed = 0;

// Rule A — open packages: no cloud lib, no closed file (except the allowlisted
// runtime adapter wiring).
for (const pkg of OPEN_PACKAGES) {
  for (const abs of walk(join(root, pkg))) {
    openFilesChecked++;
    const self = noExt(repoRel(abs));
    const allowed = isAllowlisted(self);
    const src = readFileSync(abs, "utf8");
    for (const spec of importsOf(src)) {
      // cloud lib
      if (isCloudLib(spec)) {
        if (allowed) {
          crossingsAllowed++;
          continue;
        }
        violations.push(
          `[A] ${repoRel(abs)} -> cloud lib "${spec}" (open package must not import cloud)`,
        );
        continue;
      }
      // closed-destined file (relative import)
      const target = resolveRelative(abs, spec);
      if (target && CLOSED_FILES.has(target)) {
        if (allowed) {
          crossingsAllowed++;
          continue;
        }
        violations.push(
          `[A] ${repoRel(abs)} -> closed file "${target}" (open package must not import a cloud adapter)`,
        );
      }
    }
  }
}

// Rule B — host package: only the allowlist may import a closed adapter file or
// a cloud lib directly.
for (const abs of walk(join(root, HOST, "src"))) {
  hostFilesChecked++;
  const self = noExt(repoRel(abs));
  if (isAllowlisted(self)) {
    // allowlisted host file: its cloud crossings are legitimate, count them.
    const src = readFileSync(abs, "utf8");
    for (const spec of importsOf(src)) {
      if (isCloudLib(spec)) crossingsAllowed++;
      const target = resolveRelative(abs, spec);
      if (target && CLOSED_FILES.has(target)) crossingsAllowed++;
    }
    continue;
  }
  const src = readFileSync(abs, "utf8");
  for (const spec of importsOf(src)) {
    if (isCloudLib(spec)) {
      violations.push(
        `[B] ${repoRel(abs)} -> cloud lib "${spec}" (only the main.ts wiring point + admin surface may import cloud)`,
      );
      continue;
    }
    const target = resolveRelative(abs, spec);
    if (target && CLOSED_FILES.has(target)) {
      violations.push(
        `[B] ${repoRel(abs)} -> closed file "${target}" (not on the closed-adapter import allowlist)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

if (violations.length > 0) {
  console.error("Boundary check FAILED — open/closed seam leak:\n");
  for (const v of violations.sort()) console.error(`  ${v}`);
  console.error(
    `\n${violations.length} violation(s). See BOUNDARY.md for the manifest.\n` +
      "Open code must never import a cloud adapter; route the dependency through a port.",
  );
  process.exit(1);
}

console.log(
  `Boundary OK — ${openFilesChecked} open + ${hostFilesChecked} host files clean; ` +
    `${CLOSED_FILES.size} closed adapters, ${crossingsAllowed} allowlisted crossing(s), ` +
    `${MIXED_FILES.size} mixed file(s) pending Wave-5 split (see BOUNDARY.md).`,
);
