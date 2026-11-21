#!/usr/bin/env node
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

export const USAGE_PATH = join(SHOWCASE, "src/usage.gen.json");

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

function packageOf(root) {
  return /^ui\/([^/]+)\/src$/.exec(root)?.[1];
}

function publicExportsOf(pkg) {
  const index = join(REPO, "ui", pkg, "src/index.ts");
  if (!statSync(index, { throwIfNoEntry: false })) return new Set();
  return publicExports(readFileSync(index, "utf8"));
}

export function buildUsage() {
  const specimens = readSpecimens();
  const owners = new Map();
  for (const one of specimens)
    for (const symbol of one.sources) {
      if (!owners.has(symbol)) owners.set(symbol, new Set());
      owners.get(symbol).add(one.id);
    }

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
