import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * `lib/engine.ts` boots the adapter, and stores read it while they load
 * (`stores/agent-provisioning` calls `whenEngineReady()` at module scope). If
 * the engine's own imports reach a store, the store evaluates first, finds the
 * engine half-initialized and throws `Cannot access '_ready' before
 * initialization`: vite dev's native ESM never paints the shell (the bundle
 * reorders modules and hides it). Guarded on source, the way the node runner
 * reads `.tsx` modules elsewhere.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const IMPORT = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+"(\.[^"]+)"/gms;
const SIDE_EFFECT = /^\s*import\s+"(\.[^"]+)"/gm;

function resolveModule(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (candidate.match(/\.tsx?$/) && existsSync(candidate)) return candidate;
  }
  return null;
}

function reachable(entry: string): Set<string> {
  const seen = new Set([entry]);
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    const source = readFileSync(file, "utf8");
    for (const match of [
      ...source.matchAll(IMPORT),
      ...source.matchAll(SIDE_EFFECT),
    ]) {
      const next = resolveModule(file, match[1]);
      if (next && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

describe("lib/engine.ts imports", () => {
  it("never reach a store", () => {
    const stores = [...reachable(`${SRC}/lib/engine.ts`)]
      .filter((file) => file.startsWith(`${SRC}/stores/`))
      .map((file) => file.slice(SRC.length + 1));
    assert.deepEqual(stores, []);
  });
});
