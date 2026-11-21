#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const CLOUD_LIBS = [
  "pg",
  "postgres",
  "ioredis",
  "redis",
  "mongodb",
  "@google-cloud/",
  "@kubernetes/",
  "@aws-sdk/",
  "@azure/",
  "googleapis",
  "bigquery",
];

const CLOSED_PACKAGE_SPEC = "@houston/host-cloud";

const RUNTIME_CLOUD_ALLOWLIST = new Set([
  "packages/runtime/src/turn/gcs-store",
  "packages/runtime/src/main",
]);

const MANIFEST_CLOUD_ALLOW = new Map([
  ["packages/runtime", new Set(["@google-cloud/storage"])],
]);

const REPO_SCOPES = ["@houston/", "@houston-ai/"];

const ENGINE_CLIENT_OWNERS = new Set([
  "app/src/lib/engine.ts",
  "app/src/lib/tauri.ts",
  "app/src/lib/theme-facade.ts",
  "app/src/lib/conversation-import-facade.ts",
  "app/src/lib/delegation-facade.ts",
  "app/src/lib/agents-facade.ts",
  "app/src/lib/citations-facade.ts",
  "app/src/lib/conversations-facade.ts",
  "app/src/lib/composer-prewarm-facade.ts",
  "app/src/lib/browser-live-facade.ts",
  "app/src/lib/heartbeat-facade.ts",
  "app/src/lib/linkedin-facade.ts",
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
  "app/src/lib/local-bridge-binding.ts",
  "app/src/lib/mission-row-landing.ts",
  "app/src/lib/warming-send-row.ts",
  "app/src/stores/agent-provisioning.ts",
  "app/src/stores/agent-provisioning/lifecycle.ts",
  "app/src/stores/agents-loading.ts",
]);

const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.test\./.test(entry) &&
      !/[.-](harness|test-helper|fixture|mock)\.[jt]sx?$/.test(entry) &&
      !/\.d\.ts$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

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

function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let quote = null;
  let quoteStart = -1;
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

const SPEC_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

function importsOf(src) {
  const { out, stringSpans } = stripComments(src);
  const insideString = (idx) =>
    stringSpans.some(([start, end]) => idx >= start && idx < end);
  const specs = [];
  for (const m of out.matchAll(SPEC_RE)) {
    if (insideString(m.index)) continue;
    specs.push(m[1]);
  }
  return specs;
}

const noExt = (p) => p.replace(/\.(ts|tsx)$/, "");
const repoRel = (abs) => relative(root, abs).split("\\").join("/");

function bareName(spec) {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

function isCloudLib(spec) {
  return CLOUD_LIBS.some((lib) =>
    lib.endsWith("/")
      ? spec === lib.slice(0, -1) || spec.startsWith(lib)
      : spec === lib || spec.startsWith(`${lib}/`),
  );
}

function isClosedPackageSpec(spec) {
  return (
    spec === CLOSED_PACKAGE_SPEC || spec.startsWith(`${CLOSED_PACKAGE_SPEC}/`)
  );
}

const isPathSpec = (spec) => spec.startsWith(".") || spec.startsWith("/");

function pathLandsInClosed(fromAbs, spec) {
  const target = spec.startsWith("/") ? spec : resolve(dirname(fromAbs), spec);
  const rel = noExt(repoRel(target));
  return rel === CLOSED_PACKAGE || rel.startsWith(`${CLOSED_PACKAGE}/`);
}

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

const violations = [];
let openFilesChecked = 0;
let crossingsAllowed = 0;
let manifestsChecked = 0;

for (const pkg of OPEN_PACKAGES) {
  for (const abs of walk(join(root, pkg))) {
    openFilesChecked++;
    const self = noExt(repoRel(abs));
    const runtimeAllowed = RUNTIME_CLOUD_ALLOWLIST.has(self);
    const deps = declaredDeps(abs);
    const src = readFileSync(abs, "utf8");
    for (const spec of importsOf(src)) {
      if (isPathSpec(spec)) {
        if (pathLandsInClosed(abs, spec)) {
          violations.push(
            `[A] ${repoRel(abs)} -> closed package via path "${spec}" (resolves into ${CLOSED_PACKAGE}; open code must never import closed)`,
          );
        }
        continue;
      }
      if (isClosedPackageSpec(spec)) {
        violations.push(
          `[A] ${repoRel(abs)} -> closed package "${spec}" (open code must never import @houston/host-cloud)`,
        );
        continue;
      }
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
      if (
        BUILTINS.has(spec) ||
        spec.startsWith("node:") ||
        spec === "bun" ||
        spec.startsWith("bun:")
      ) {
        continue;
      }
      if (REPO_SCOPES.some((scope) => spec.startsWith(scope))) {
        continue;
      }
      if (!deps.has(bareName(spec))) {
        violations.push(
          `[A] ${repoRel(abs)} -> undeclared import "${spec}" (not a dependency of its package; declare it or remove it — an undeclared cloud dep must not slip past the denylist)`,
        );
      }
    }
  }
}

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
