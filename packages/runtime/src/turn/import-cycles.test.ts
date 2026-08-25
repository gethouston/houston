import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The turn worker ships as an esbuild bundle (selfhost/bundle.mjs). esbuild's
 * __esm module emulation awaits each imported module's evaluation, so an
 * import CYCLE anywhere in a graph that also contains top-level await becomes
 * a boot DEADLOCK: both sides await each other forever, the event loop
 * empties, and node exits with no output at all (observed as the staging
 * engine-pool CrashLoopBackOff of 2026-08-24, op-apply ↔ op-route). Plain ESM
 * (tsx, node on sources) tolerates the same cycle, so nothing else catches it.
 * This test statically forbids relative-import cycles inside src/turn.
 */

const turnDir = dirname(fileURLToPath(import.meta.url));

function relativeImports(file: string): string[] {
  const source = readFileSync(join(turnDir, file), "utf8");
  const specs: string[] = [];
  const re = /(?:from|import)\s*\(?\s*["'](\.\/[^"']+)["']\s*\)?/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    // `import type { ... }` is erased by esbuild and creates no runtime edge.
    const statementStart = source.lastIndexOf("import", m.index);
    const statement = source.slice(statementStart, m.index + m[0].length);
    if (/^import\s+type\b/.test(statement)) continue;
    specs.push(`${m[1].replace(/^\.\//, "").replace(/\.(js|ts)$/, "")}.ts`);
  }
  return specs;
}

describe("turn module graph", () => {
  it("has no runtime import cycles (esbuild + top-level await deadlocks on them)", () => {
    const files = readdirSync(turnDir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    const graph = new Map(files.map((f) => [f, relativeImports(f)]));

    const OK = 2;
    const VISITING = 1;
    const state = new Map<string, number>();
    const cycles: string[] = [];
    const visit = (file: string, path: string[]) => {
      if (state.get(file) === OK) return;
      if (state.get(file) === VISITING) {
        cycles.push([...path.slice(path.indexOf(file)), file].join(" -> "));
        return;
      }
      state.set(file, VISITING);
      for (const dep of graph.get(file) ?? []) {
        if (graph.has(dep)) visit(dep, [...path, file]);
      }
      state.set(file, OK);
    };
    for (const file of files) visit(file, []);

    expect(cycles).toEqual([]);
  });
});
