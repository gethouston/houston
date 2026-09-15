import { deepStrictEqual, ok } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The os-bridge barrel must expose the WHOLE bridge.
 *
 * ~60 call sites import `os*` wrappers from `lib/os-bridge`, never from a
 * category module, so a wrapper that exists in `os-bridge/<category>.ts` but is
 * not reachable through the barrel is invisible: the caller's import fails at
 * build time and the natural "fix" is a deep import that erodes the boundary
 * `scripts/check-desktop-native.mjs` guards. Adding a category module and
 * forgetting its `export *` line fails here instead.
 *
 * Asserted on source text, not by importing: these modules pull in
 * `@tauri-apps/*`, which only the bundler resolves.
 */

const DIR = new URL("../src/lib/os-bridge/", import.meta.url);
const read = (url: URL) => readFileSync(url, "utf8");

/** Every top-level exported name of a module, declarations only. */
function exportedNames(src: string): string[] {
  return [
    ...src.matchAll(
      /^export\s+(?:async\s+)?(?:function|interface|type|const|class)\s+([A-Za-z0-9_]+)/gm,
    ),
  ].map((m) => m[1]);
}

const modules = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts"))
  .sort();
const barrel = read(new URL("../src/lib/os-bridge.ts", import.meta.url));
// The `.ts` extension is load-bearing, not decoration: `app/tests` runs under
// node's ESM resolver (no bundler), where an extensionless relative specifier
// simply does not resolve.
const reExported = [
  ...barrel.matchAll(
    /^export\s+\*\s+from\s+"\.\/os-bridge\/([a-z-]+\.ts)";$/gm,
  ),
].map((m) => m[1]);

describe("os-bridge barrel", () => {
  it("re-exports every category module", () => {
    // `invoke.ts` is the private seam: exported to its siblings, never to the
    // app, so a caller cannot reach past a wrapper to raw `invokeNative`.
    deepStrictEqual(
      reExported.slice().sort(),
      modules.filter((m) => m !== "invoke.ts"),
    );
    ok(!reExported.includes("invoke.ts"), "invokeNative stays module-private");
  });

  it("makes every wrapper the modules export reachable from the barrel", () => {
    const seen = new Map<string, string>();
    for (const file of reExported) {
      const names = exportedNames(read(new URL(file, DIR)));
      ok(names.length > 0, `${file} exports nothing — delete it`);
      for (const name of names) {
        const other = seen.get(name);
        ok(
          other === undefined,
          `${name} is exported by both ${other} and ${file}; \`export *\` would leave it ambiguous`,
        );
        seen.set(name, file);
      }
    }
    // Star re-exports carry the names verbatim, so reachability is exactly the
    // union above — assert the barrel adds no hand-maintained subset beside it.
    ok(
      !/^export\s*\{/m.test(barrel),
      "the barrel re-exports whole modules, never a hand-listed subset",
    );
    ok(seen.size >= 50, `expected the full native surface, saw ${seen.size}`);
  });
});
