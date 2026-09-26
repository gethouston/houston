#!/usr/bin/env node
/**
 * Keeps "Houston" (this repo) cloud-free. The CLOSED control plane
 * (`@houston/host-cloud` — the concrete cloud adapters pg / GCS / GKE / Redis /
 * BigQuery, the operator-admin surface, and the cloud `main.ts`) was RETIRED
 * and deleted: the shipped cloud is a private gateway plus one engine pod per
 * agent running this repo's open host/runtime, so the multi-tenant host was an
 * architecture Houston moved past (it remains in git history). See BOUNDARY.md
 * for the manifest this script enforces.
 *
 *   - Every package here is OPEN: every `packages/*` workspace package
 *     (enumerated dynamically, so a brand-new package is covered the day it
 *     appears) plus the `ui/` React packages. None of them may EVER import a
 *     cloud lib or `@houston/host-cloud`. Staying cloud-lib-free is what keeps
 *     this code deployment-agnostic (desktop, engine pod, self-host).
 *
 * Four protections, all fail the build (exit 1). A-C guard the open/closed
 * seam; D guards the app's own error-surfacing layer:
 *
 *   Rule A — no OPEN-package file reaches the closed package or a cloud lib. A
 *     reach is ANY of:
 *       (a) a bare `@houston/host-cloud` (or subpath) specifier;
 *       (b) a relative/absolute import that resolves under the closed package's
 *           former `packages/host-cloud/` path — a deep-relative specifier like
 *           `../../host-cloud/src/...` never contains the bare package name, so
 *           it would slip past a bare-spec match;
 *       (c) a known cloud lib (the CLOUD_LIBS denylist);
 *       (d) an UNDECLARED bare import — a specifier that is not a node/bun builtin
 *           and not a dependency of the importing file's own package.json. This is
 *           the allowlist half: a future cloud dep the denylist has never heard of
 *           (a novel `@vendor/db`) cannot be imported without first being declared,
 *           where Rule C then sees it.
 *     The ONE documented exception is the runtime's own cloud adapter
 *     (`packages/runtime/src/turn/gcs-store.ts`), reachable only from the runtime's
 *     wiring point (`packages/runtime/src/main.ts`) — the same port+adapter+wiring
 *     shape one level down. Those two files may import `@google-cloud/storage`.
 *
 *   Rule B — `packages/host-cloud/` must NOT exist here. It was retired and
 *     deleted; anything reappearing under that path would silently re-publish
 *     closed code. Local build leftovers (a gitignored node_modules/ or dist/
 *     that survives a branch switch on a dev machine) are tolerated — only
 *     real content under the path fails.
 *
 *   Rule C (manifest) — no OPEN package may DECLARE the closed package or a cloud
 *     lib as a dependency (any bucket). This is the allowlist direction the seam
 *     wants: a denylist of import specifiers lets a new cloud dep leak green by
 *     default, but a dependency must be declared to resolve, and a declaration is
 *     a small, reviewable surface. The runtime's `@google-cloud/storage` is the
 *     one documented exception.
 *
 *   Rule D — a boundary INSIDE the app, not across the open/closed seam: only
 *     `app/src/lib/tauri.ts` may reach the engine client freely, because that
 *     module is the error-surfacing policy layer (`call()`: the Sentry grouping
 *     label, the per-call toast/silence options, the expected-state ladder).
 *     Every other `getEngine()` caller is a failure with NO toast, NO Sentry
 *     and NO expected-state classification, so the set is frozen to a written
 *     allowlist: a new bypass is a deliberate, reviewable diff, and the list
 *     shrinks as callers move onto a `tauri.ts` namespace.
 *
 * No new npm deps: a regex import extractor (comments stripped first) over
 * .ts/.tsx + node:fs.
 *
 * Run: node scripts/check-boundaries.mjs   (root script: pnpm check:boundaries)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// The manifest (must stay in sync with BOUNDARY.md).
// ---------------------------------------------------------------------------

/**
 * Open packages whose every file must be free of cloud (Rule A) and whose
 * package.json must not declare cloud (Rule C). Repo-relative. Enumerated
 * dynamically from `packages/*` (mirroring the pnpm-workspace.yaml glob) plus
 * `ui`, so a brand-new package is covered the day it appears — a fixed list
 * would let cloud code reappear under a new name unchecked. The retired
 * closed path is excluded here; Rule B owns it.
 */
const CLOSED_PACKAGE = "packages/host-cloud";
const OPEN_PACKAGES = [
  ...readdirSync(join(root, "packages"))
    .map((entry) => `packages/${entry}`)
    .filter(
      (pkg) =>
        pkg !== CLOSED_PACKAGE && statSync(join(root, pkg)).isDirectory(),
    ),
  "ui",
];

/**
 * Bare specifiers that are cloud-only. A `from "<lib>"` or `from "<lib>/..."`
 * is a cloud import. Trailing-slash entries match the scope/prefix (so
 * `@google-cloud/` guards storage, bigquery, ...); the rest match the bare lib
 * or any subpath. `postgres` is postgres.js (distinct from `pg`).
 *
 * This denylist gives precise "file -> cloud lib X" errors for the known cloud
 * surface, but it is NOT the load-bearing guarantee — Rule A(d) + Rule C catch
 * cloud deps the denylist has never heard of.
 */
const CLOUD_LIBS = [
  "pg",
  "postgres",
  "ioredis",
  "redis",
  "mongodb",
  "@google-cloud/", // storage, bigquery, ...
  "@kubernetes/",
  "@aws-sdk/",
  "@azure/",
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

/**
 * The matching Rule-C exception: `packages/runtime` MAY declare the cloud lib its
 * GcsStore adapter needs. Keyed by repo-relative package dir.
 */
const MANIFEST_CLOUD_ALLOW = new Map([
  ["packages/runtime", new Set(["@google-cloud/storage"])],
]);

/**
 * Rule A(d) exemption: the repo's own package scopes. `packages/web` mirrors
 * `app/src` through a vite alias (`@houston/app/...` is a path rewrite, not an
 * npm dependency) and test harnesses self-import their package's public name —
 * neither can be a cloud lib. `@houston/host-cloud` specifically is still
 * caught by Rule A(a), which runs before (d).
 */
const REPO_SCOPES = ["@houston/", "@houston-ai/"];

/**
 * Rule D's frozen set. `app/src/lib/engine.ts` DECLARES `getEngine`, and
 * `app/src/lib/tauri.ts` is the error-surfacing layer it exists for; every file
 * below calls it directly instead, so a failure there reaches no toast, no
 * Sentry and no expected-state classification. They are allowed because they
 * already ship, not because the bypass is right — the list may shrink (route a
 * caller through a `tauri.ts` namespace and delete its line) and may only grow
 * with a reviewer's agreement. Repo-relative, with extension.
 *
 * `theme-facade.ts` IS that layer, not a bypass of it: it holds one namespace in
 * its own file because tauri.ts is already the app's whole engine surface, and it
 * wraps every call in the same `engineCall` policy the namespaces still there use.
 * An owner earns its place that way, by surfacing failures through tauri.ts, and
 * never merely by being a lib file.
 */
const ENGINE_CLIENT_OWNERS = new Set([
  "app/src/lib/engine.ts",
  "app/src/lib/tauri.ts",
  "app/src/lib/theme-facade.ts",
]);
const ENGINE_CALL_BYPASS = new Set([
  "app/src/components/agent-actions/use-copy-agent.ts",
  "app/src/components/copy-agent/use-copy-agent-wizard.ts",
  "app/src/components/portable/import-install.ts",
  "app/src/components/portable/use-import-package.ts",
  "app/src/hooks/queries/use-triggers.ts",
  "app/src/hooks/queries/use-workspace-context.ts",
  "app/src/hooks/use-capabilities.ts",
  "app/src/hooks/use-move-resume.ts",
  "app/src/hooks/use-provider-catalog.ts",
  "app/src/hooks/use-team-move-resume.ts",
  "app/src/lib/claude-login-remote.ts",
  "app/src/lib/cloud-migration-runner.ts",
  "app/src/lib/cloud-migration-transport.ts",
  "app/src/lib/local-bridge-binding.ts",
  "app/src/lib/mission-row-landing.ts",
  "app/src/lib/mission-title.ts",
  "app/src/lib/warming-send-row.ts",
  "app/src/main.tsx",
  "app/src/stores/agent-provisioning.ts",
  "app/src/stores/agent-provisioning/lifecycle.ts",
  "app/src/stores/agents-loading.ts",
]);

/** Node + Bun builtins are always fine to import from open code. */
const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
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

/** Every package.json under `dir` (excluding node_modules/dist). */
function packageManifests(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  if (entries.includes("package.json")) out.push(join(dir, "package.json"));
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...packageManifests(full));
  }
  return out;
}

/**
 * Strip `//` line and block comments, respecting string and template literals so
 * a `//` or `/*` inside a string is not mistaken for a comment. Without this, a
 * commented-out `// import { Pg } from "pg"` would false-FAIL, and prose like a
 * doc-comment containing `import "from a friend"` would be mis-extracted as a
 * (undeclared) import. Comments cannot contain a real import, so dropping them
 * only ever removes noise — never a genuine specifier.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let quote = null;
  let quoteStart = -1;
  /** [start, end) spans of string-literal CONTENTS in `out` (quotes excluded),
   *  so the matcher can reject a keyword that sits INSIDE a string — e.g. a
   *  test title ending in the word `from",` reads as `from "<code...>"` to a
   *  span-blind regex and false-FAILs the gate. */
  const stringSpans = [];
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === quote) {
        stringSpans.push([quoteStart, out.length - 1]);
        quote = null;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      quoteStart = out.length;
      i++;
      continue;
    }
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  if (quote) stringSpans.push([quoteStart, out.length]);
  return { out, stringSpans };
}

/**
 * Every import/export specifier in a source file: static `from "x"`,
 * `export ... from "x"`, side-effect `import "x"`, dynamic `import("x")`, and
 * CommonJS `require("x")` (comments stripped first).
 */
const SPEC_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

function importsOf(src) {
  const { out, stringSpans } = stripComments(src);
  const insideString = (idx) =>
    stringSpans.some(([start, end]) => idx >= start && idx < end);
  const specs = [];
  for (const m of out.matchAll(SPEC_RE)) {
    // A keyword inside a string literal is prose, not an import — the string
    // AFTER a real keyword is the specifier and is rightly its own span.
    if (insideString(m.index)) continue;
    specs.push(m[1]);
  }
  return specs;
}

const noExt = (p) => p.replace(/\.(ts|tsx)$/, "");
const repoRel = (abs) => relative(root, abs).split("\\").join("/");

/** The bare package name of a specifier (drops any subpath). */
function bareName(spec) {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

/** Is `spec` a cloud lib? Matches the bare lib or any subpath. */
function isCloudLib(spec) {
  return CLOUD_LIBS.some((lib) =>
    lib.endsWith("/")
      ? spec === lib.slice(0, -1) || spec.startsWith(lib)
      : spec === lib || spec.startsWith(`${lib}/`),
  );
}

/** Is `spec` the bare specifier of the closed host-cloud package? */
function isClosedPackageSpec(spec) {
  return (
    spec === CLOSED_PACKAGE_SPEC || spec.startsWith(`${CLOSED_PACKAGE_SPEC}/`)
  );
}

/** Is `spec` a relative or absolute path (as opposed to a bare package spec)? */
const isPathSpec = (spec) => spec.startsWith(".") || spec.startsWith("/");

/**
 * Resolve a relative/absolute `spec` from `fromAbs` to a repo-relative, no-ext
 * path, and report whether it lands under the closed package's former path.
 * Pure string resolution (no disk lookup), so the deep-relative leak vector —
 * `../../host-cloud/src/launcher/gke`, which never contains the bare spec —
 * is caught even though the directory no longer exists.
 */
function pathLandsInClosed(fromAbs, spec) {
  const target = spec.startsWith("/") ? spec : resolve(dirname(fromAbs), spec);
  const rel = noExt(repoRel(target));
  return rel === CLOSED_PACKAGE || rel.startsWith(`${CLOSED_PACKAGE}/`);
}

/** Declared deps (all buckets) of the package.json nearest to `abs`, cached. */
const declCache = new Map();
function declaredDeps(abs) {
  let dir = dirname(abs);
  while (dir.startsWith(root)) {
    const pj = join(dir, "package.json");
    if (existsSync(pj)) {
      let deps = declCache.get(pj);
      if (!deps) {
        const m = JSON.parse(readFileSync(pj, "utf8"));
        deps = new Set([
          ...Object.keys(m.dependencies ?? {}),
          ...Object.keys(m.devDependencies ?? {}),
          ...Object.keys(m.peerDependencies ?? {}),
          ...Object.keys(m.optionalDependencies ?? {}),
        ]);
        declCache.set(pj, deps);
      }
      return deps;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return new Set();
}

// ---------------------------------------------------------------------------
// Rules.
// ---------------------------------------------------------------------------

const violations = [];
let openFilesChecked = 0;
let crossingsAllowed = 0;
let manifestsChecked = 0;

// Rule A — open packages (incl. packages/host): no reach into the closed package
// or a cloud lib, by ANY of bare spec / resolved path / denylist / undeclared.
// The ONE exception is the runtime's own cloud adapter wiring.
for (const pkg of OPEN_PACKAGES) {
  for (const abs of walk(join(root, pkg))) {
    openFilesChecked++;
    const self = noExt(repoRel(abs));
    const runtimeAllowed = RUNTIME_CLOUD_ALLOWLIST.has(self);
    const deps = declaredDeps(abs);
    const src = readFileSync(abs, "utf8");
    for (const spec of importsOf(src)) {
      // (b) a path import — only the closed package is forbidden; staying open is fine.
      if (isPathSpec(spec)) {
        if (pathLandsInClosed(abs, spec)) {
          violations.push(
            `[A] ${repoRel(abs)} -> closed package via path "${spec}" (resolves into ${CLOSED_PACKAGE}; open code must never import closed)`,
          );
        }
        continue;
      }
      // (a) the closed package's own specifier — never, no allowlist.
      if (isClosedPackageSpec(spec)) {
        violations.push(
          `[A] ${repoRel(abs)} -> closed package "${spec}" (open code must never import @houston/host-cloud)`,
        );
        continue;
      }
      // (c) a known cloud lib — the runtime adapter is the one allowed crossing.
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
      // builtins are always fine.
      if (
        BUILTINS.has(spec) ||
        spec.startsWith("node:") ||
        spec === "bun" ||
        spec.startsWith("bun:")
      ) {
        continue;
      }
      // Repo-internal scopes (vite aliases, self-imports) are never cloud libs;
      // @houston/host-cloud was already rejected by (a) above.
      if (REPO_SCOPES.some((scope) => spec.startsWith(scope))) {
        continue;
      }
      // (d) the allowlist half: a bare import must be a declared dependency. An
      // undeclared one is a cloud dep the denylist can't see.
      if (!deps.has(bareName(spec))) {
        violations.push(
          `[A] ${repoRel(abs)} -> undeclared import "${spec}" (not a dependency of its package; declare it or remove it — an undeclared cloud dep must not slip past the denylist)`,
        );
      }
    }
  }
}

// Rule B — the closed package was retired and deleted. Anything reappearing
// under its old path would silently re-publish closed code. Gitignored build
// leftovers are tolerated: pnpm installed a node_modules/ under this path on
// every pre-retirement checkout, and a branch switch removes only tracked
// files — a dev machine with that leftover must not false-fail.
const RULE_B_LEFTOVERS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "coverage",
  ".DS_Store",
]);
if (existsSync(join(root, CLOSED_PACKAGE))) {
  const remnants = readdirSync(join(root, CLOSED_PACKAGE)).filter(
    (entry) => !RULE_B_LEFTOVERS.has(entry),
  );
  if (remnants.length > 0) {
    violations.push(
      `[B] ${CLOSED_PACKAGE} must not exist — the closed control plane was retired (it survives in git history); do not re-add it here (found: ${remnants.sort().join(", ")})`,
    );
  }
}

// Rule C (manifest) — no open package may DECLARE the closed package or a cloud
// lib as a dependency (any bucket). The runtime's GcsStore dep is the exception.
for (const pkg of OPEN_PACKAGES) {
  for (const pj of packageManifests(join(root, pkg))) {
    manifestsChecked++;
    const rel = repoRel(pj);
    const allow = MANIFEST_CLOUD_ALLOW.get(repoRel(dirname(pj))) ?? new Set();
    const manifest = JSON.parse(readFileSync(pj, "utf8"));
    for (const bucket of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      for (const dep of Object.keys(manifest[bucket] ?? {})) {
        if (allow.has(dep)) continue;
        if (isClosedPackageSpec(dep)) {
          violations.push(
            `[C] ${rel} (${bucket}) declares the closed package "${dep}" — open packages must not depend on @houston/host-cloud`,
          );
        } else if (isCloudLib(dep)) {
          violations.push(
            `[C] ${rel} (${bucket}) declares cloud lib "${dep}" — open packages must not depend on cloud libraries`,
          );
        }
      }
    }
  }
}

// Rule D — the getEngine() bypass set is frozen. Counted on the RAW source: a
// `getEngine()` inside a comment is still a reader being told this file talks
// to the engine, and a commented-out call is one paste from being live.
// Only where there IS an app: the boundary fixture tree
// (scripts/test/check-boundaries.test.sh) is packages-only, and the real repo
// cannot lose app/src without losing the product, so the skip is stated rather
// than assumed.
const appSrc = join(root, "app", "src");
const hasApp = existsSync(appSrc);
let bypassesChecked = 0;
const bypassSeen = new Set();
for (const abs of hasApp ? walk(appSrc) : []) {
  const rel = repoRel(abs);
  if (ENGINE_CLIENT_OWNERS.has(rel)) continue;
  if (!readFileSync(abs, "utf8").includes("getEngine()")) continue;
  bypassesChecked++;
  if (ENGINE_CALL_BYPASS.has(rel)) bypassSeen.add(rel);
  else
    violations.push(
      `[D] ${rel} calls getEngine() directly, outside app/src/lib/tauri.ts — its failures get no toast, no Sentry and no expected-state classification; route it through a tauri.ts namespace, or add it to ENGINE_CALL_BYPASS with a reviewer's agreement`,
    );
}
for (const rel of hasApp ? ENGINE_CALL_BYPASS : [])
  if (!bypassSeen.has(rel))
    violations.push(
      `[D] ${rel} no longer calls getEngine() (or no longer exists) — delete its ENGINE_CALL_BYPASS line; the list only stays meaningful while it is exact`,
    );

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

if (violations.length > 0) {
  console.error("Boundary check FAILED — open/closed seam leak:\n");
  for (const v of violations.sort()) console.error(`  ${v}`);
  console.error(
    `\n${violations.length} violation(s). See BOUNDARY.md for the manifest.\n` +
      "Open code must never import or declare a cloud lib or @houston/host-cloud; route the dependency through a port.",
  );
  process.exit(1);
}

console.log(
  `Boundary OK — ${openFilesChecked} open file(s) clean across ${OPEN_PACKAGES.length} package root(s); ` +
    `no ${CLOSED_PACKAGE} present (retired); ` +
    `${crossingsAllowed} allowlisted cloud crossing(s); ` +
    `${manifestsChecked} open manifest(s) clean; ` +
    (hasApp
      ? `${bypassesChecked} app/src getEngine() bypass(es), all declared.`
      : "no app/src here, so Rule D does not apply."),
);
