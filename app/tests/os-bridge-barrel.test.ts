import { deepStrictEqual, ok } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const DIR = new URL("../src/lib/os-bridge/", import.meta.url);
const read = (url: URL) => readFileSync(url, "utf8");

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
const reExported = [
  ...barrel.matchAll(
    /^export\s+\*\s+from\s+"\.\/os-bridge\/([a-z-]+\.ts)";$/gm,
  ),
].map((m) => m[1]);

describe("os-bridge barrel", () => {
  it("re-exports every category module", () => {
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
    ok(
      !/^export\s*\{/m.test(barrel),
      "the barrel re-exports whole modules, never a hand-listed subset",
    );
    ok(seen.size >= 50, `expected the full native surface, saw ${seen.size}`);
  });
});
