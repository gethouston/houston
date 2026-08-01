#!/usr/bin/env node
/**
 * Builds the showcase's "Used in" map: for every specimen, the product surfaces
 * that actually import the symbols it documents.
 *
 * Plain Node, no dependencies, no TypeScript loader — everything it needs is
 * trivially lexical and read as text by its two neighbours:
 * `read-specimens.mjs` (the `sources` a page declares) and `scan-imports.mjs`
 * (the `@houston-ai/*` imports the repo writes, and — inside a `ui/*` package
 * — the `./sibling` imports that compose a package's own components into its
 * assembled screens). This file is the assembly: which roots to walk, and how
 * a hit becomes a labelled surface.
 *
 *   pnpm --filter @houston-ai/showcase gen:usage   # writes src/usage.gen.json
 *   node scripts/gen-usage.mjs --out=/tmp/x.json   # writes elsewhere (the test)
 *
 * Output is fully sorted, so regenerating a clean tree produces a byte-identical
 * file and the checked-in JSON stays diff-clean.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readSpecimens } from "./read-specimens.mjs";
import {
  importedSymbols,
  publicExports,
  relativeImports,
} from "./scan-imports.mjs";
import { surfaceOf } from "./surface-rules.mjs";

const SHOWCASE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(SHOWCASE, "../..");

/** The file the checked-in map lives at. */
export const USAGE_PATH = join(SHOWCASE, "src/usage.gen.json");

/**
 * Everything scanned for usage, repo-relative: the two app frontends, the store
 * website, and every `ui/*` package except this one — the showcase importing a
 * component is documentation, not usage.
 */
export const SCAN_ROOTS = [
  "app/src",
  "packages/web/src",
  "agentstore/src",
  ...readdirSync(join(REPO, "ui"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "showcase")
    .map((entry) => `ui/${entry.name}/src`),
]
  .filter((path) => statSync(join(REPO, path), { throwIfNoEntry: false }))
  .sort();

/** Every `.ts`/`.tsx` under `dir`, repo-relative and sorted. */
function sourceFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : 1),
    )) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
        found.push(relative(REPO, path));
    }
  };
  walk(dir);
  return found;
}

/** The package a scan root belongs to, or nothing for the app frontends. */
function packageOf(root) {
  return /^ui\/([^/]+)\/src$/.exec(root)?.[1];
}

/**
 * The symbols `ui/<pkg>` publishes, read off its `src/index.ts`.
 *
 * The gate on internal usage: a relative import only counts when the symbol is
 * one this package actually exports. Without it, any local helper that happens
 * to share a name with a documented component ("Avatar", "Card") would be
 * credited to that component's page.
 */
function publicExportsOf(pkg) {
  const index = join(REPO, "ui", pkg, "src/index.ts");
  if (!statSync(index, { throwIfNoEntry: false })) return new Set();
  return publicExports(readFileSync(index, "utf8"));
}

/**
 * `{ [specimenId]: { surfaces, fileCount } }` — surfaces sorted, ids sorted, a
 * specimen with no consumer left out entirely (the page then shows no row).
 *
 * Two kinds of hit, and both are real usage:
 *   - a cross-package `@houston-ai/*` import, labelled by where it lives
 *     (`Activity`, `Web app`, `ui/board (library)`);
 *   - a RELATIVE import inside the package that owns the component, labelled
 *     `ui/<pkg> (internal)` — how `AIBoard` composes `KanbanBoard`. Without it
 *     the components the product assembles from read as unused, which is the
 *     exact opposite of the truth.
 */
export function buildUsage() {
  const specimens = readSpecimens();
  /** symbol → the specimen ids that document it. */
  const owners = new Map();
  for (const one of specimens)
    for (const symbol of one.sources) {
      if (!owners.has(symbol)) owners.set(symbol, new Set());
      owners.get(symbol).add(one.id);
    }

  /** specimen id → surface label → how many files of that surface use it. */
  const hits = new Map(specimens.map((one) => [one.id, new Map()]));
  const credit = (id, label) => {
    const surfaces = hits.get(id);
    surfaces.set(label, (surfaces.get(label) ?? 0) + 1);
  };

  for (const root of SCAN_ROOTS) {
    const pkg = packageOf(root);
    const exported = pkg ? publicExportsOf(pkg) : new Set();
    for (const path of sourceFiles(join(REPO, root))) {
      const source = readFileSync(join(REPO, path), "utf8");

      const matched = new Set();
      for (const symbol of importedSymbols(source))
        for (const id of owners.get(symbol) ?? []) matched.add(id);
      for (const id of matched) credit(id, surfaceOf(path));

      if (!pkg) continue;
      const internal = new Set();
      for (const symbol of relativeImports(source)) {
        if (!exported.has(symbol)) continue;
        // A file that already counted for this page through a package import
        // must not count twice — one file is one hit per surface.
        for (const id of owners.get(symbol) ?? [])
          if (!matched.has(id)) internal.add(id);
      }
      for (const id of internal) credit(id, `ui/${pkg} (internal)`);
    }
  }

  const usage = {};
  for (const id of [...hits.keys()].sort()) {
    const surfaces = hits.get(id);
    if (surfaces.size === 0) continue;
    usage[id] = {
      surfaces: [...surfaces.keys()].sort(),
      fileCount: [...surfaces.values()].reduce((a, b) => a + b, 0),
    };
  }
  return usage;
}

/** The exact bytes `src/usage.gen.json` holds — one place, so the test agrees. */
export function renderUsage(usage) {
  return `${JSON.stringify(usage, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv.slice(2).find((one) => one.startsWith("--out="));
  const out = flag ? resolve(flag.slice("--out=".length)) : USAGE_PATH;
  const usage = buildUsage();
  writeFileSync(out, renderUsage(usage));
  console.log(
    `${relative(REPO, out)}: ${Object.keys(usage).length} specimens with usage, scanned ${SCAN_ROOTS.length} roots`,
  );
}
