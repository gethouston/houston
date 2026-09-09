import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { SourceMap } from "node:module";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BundleSourceMap, type GeneratedPosition } from "./source-map";
import { buildFixtureBundle, type FixtureBundle } from "./source-map.fixture";

let fixture: FixtureBundle;

beforeAll(async () => {
  fixture = await buildFixtureBundle();
});

afterAll(() => {
  rmSync(fixture.dir, { recursive: true, force: true });
});

describe("BundleSourceMap", () => {
  it("agrees with Node's own SourceMap.findOrigin on every generated position", () => {
    // Node's decoder is what `--enable-source-maps` used to apply to stack
    // traces; the streaming scan must give the same answer for every line
    // and column of the bundle (including positions past the last segment
    // of a line and on lines without segments, where Node extrapolates), or
    // the mapped frames would silently drift from what pods reported before.
    const map = BundleSourceMap.load(fixture.bundlePath);
    expect(map).toBeDefined();
    const oracle = new SourceMap(
      JSON.parse(readFileSync(fixture.mapPath, "utf8")),
    );
    const lineCount = readFileSync(fixture.bundlePath, "utf8").split(
      "\n",
    ).length;
    const needles: GeneratedPosition[] = [];
    for (let line = 1; line <= lineCount; line++) {
      for (const column of [0, 1, 2, 5, 6, 8, 12, 40]) {
        needles.push({ line, column });
      }
    }
    // Shuffle so the batch scan's sort-by-line is exercised too.
    needles.sort(() => Math.random() - 0.5);
    const found = (map as BundleSourceMap).lookup(needles);
    let mapped = 0;
    needles.forEach((needle, i) => {
      const expected = oracle.findOrigin(needle.line, needle.column + 1);
      const actual = found[i];
      if (!("fileName" in expected)) {
        expect(actual, `${needle.line}:${needle.column}`).toBeUndefined();
        return;
      }
      mapped++;
      expect(actual, `${needle.line}:${needle.column}`).toEqual({
        file: resolve(dirname(fixture.mapPath), expected.fileName),
        line: expected.lineNumber,
        // Node lets a cross-line extrapolation go negative; the mapper clamps.
        column: Math.max(0, expected.columnNumber - 1),
      });
    });
    expect(mapped).toBeGreaterThan(10);
    expect(found.some((p) => p?.file === fixture.sitePath)).toBe(true);
    expect(found.some((p) => p?.file === fixture.loggingPath)).toBe(true);
  });

  it("needles before the first segment are unmapped; later ones extrapolate", () => {
    // ";AAAA": no segment on generated line 1, one at line 2 col 0 → source
    // 0 line 1 col 0. Node's rule carries the distance from the last segment
    // over, so line 4 col 5 lands on source line 3 col 5.
    const bundle = `${fixture.dir}/sparse.mjs`;
    writeFileSync(
      `${bundle}.map`,
      JSON.stringify({ version: 3, sources: ["src/a.ts"], mappings: ";AAAA" }),
    );
    const map = BundleSourceMap.load(bundle) as BundleSourceMap;
    expect(
      map.lookup([
        { line: 1, column: 0 },
        { line: 2, column: 0 },
        { line: 4, column: 5 },
      ]),
    ).toEqual([
      undefined,
      { file: `${fixture.dir}/src/a.ts`, line: 1, column: 0 },
      { file: `${fixture.dir}/src/a.ts`, line: 3, column: 5 },
    ]);
    expect(map.lookup([])).toEqual([]);
  });

  it("load: missing map → undefined, never a throw", () => {
    expect(BundleSourceMap.load("/nonexistent/main.mjs")).toBeUndefined();
  });

  it("load: a file that is not a v3 map → undefined", () => {
    const bundle = `${fixture.dir}/notamap.mjs`;
    writeFileSync(`${bundle}.map`, '{"version":2,"mappings":"AAAA"}');
    expect(BundleSourceMap.load(bundle)).toBeUndefined();
    writeFileSync(`${bundle}.map`, "{ this is not json");
    expect(BundleSourceMap.load(bundle)).toBeUndefined();
  });

  it("lookup: a malformed mappings string keeps what was resolved before it", () => {
    // Line 1 has two valid segments (col 0 → src line 1, col 1 → src line
    // 2); line 2 is garbage. The needle between the two segments resolved
    // before the scan hit the corruption and stands; the one on line 2 is
    // left alone rather than guessed.
    const bundle = `${fixture.dir}/broken.mjs`;
    writeFileSync(
      `${bundle}.map`,
      JSON.stringify({
        version: 3,
        sources: ["src/ok.ts"],
        mappings: "AAAA,CACA;!!!!",
      }),
    );
    const map = BundleSourceMap.load(bundle) as BundleSourceMap;
    expect(
      map.lookup([
        { line: 1, column: 0 },
        { line: 2, column: 0 },
      ]),
    ).toEqual([
      { file: `${fixture.dir}/src/ok.ts`, line: 1, column: 0 },
      undefined,
    ]);
  });
});
