import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const turnDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(turnDir, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
      out.push(full);
  }
  return out;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec.replace(/\.js$/, ""));
  for (const candidate of [
    base.endsWith(".ts") || base.endsWith(".tsx") ? base : null,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ]) {
    if (!candidate) continue;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function runtimeEdges(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const edges: string[] = [];
  const re =
    /(?:\b(?:import|export)\s+(?:type\s+)?[^;'"]*?from\s*["'](\.\.?\/[^"']+)["'])|(?:\bimport\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\))/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const statement = m[0];
    const spec = m[1] ?? m[2];
    if (/^(?:import|export)\s+type\b/.test(statement)) continue;
    const braces = statement.match(/\{([^}]*)\}/);
    if (braces) {
      const names = braces[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue;
    }
    const target = resolveSpec(file, spec);
    if (target) edges.push(target);
  }
  return edges;
}

describe("turn module graph", () => {
  it("has no runtime import cycles through src/turn (esbuild + top-level await deadlocks on them)", () => {
    const files = sourceFiles(srcDir);
    const graph = new Map(files.map((f) => [f, runtimeEdges(f)]));
    const inTurn = (f: string) => dirname(f) === turnDir;

    const OK = 2;
    const VISITING = 1;
    const state = new Map<string, number>();
    const cycles: string[] = [];
    const visit = (file: string, path: string[]) => {
      if (state.get(file) === OK) return;
      if (state.get(file) === VISITING) {
        const loop = [...path.slice(path.indexOf(file)), file];
        if (loop.some(inTurn))
          cycles.push(
            loop.map((f) => posix.normalize(relative(srcDir, f))).join(" -> "),
          );
        return;
      }
      state.set(file, VISITING);
      for (const dep of graph.get(file) ?? []) visit(dep, [...path, file]);
      state.set(file, OK);
    };
    for (const file of files) visit(file, []);

    expect(cycles).toEqual([]);
  });
});
