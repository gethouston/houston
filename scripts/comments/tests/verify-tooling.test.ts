import { describe, expect, it } from "vitest";
import { parseArgs } from "../args.ts";
import { compareTokens, verifyFile } from "../verify.ts";

const verify = (file: string, base: string, work: string, allowCode = false) =>
  verifyFile(file, base, work, { pinned: [], allowCode });

describe("comments:verify tooling comments", () => {
  it.each([
    [
      "a.ts",
      "/**\n * Lists.\n * @assistant group:agents\n */\nexport const a = 1;\n",
      "export const a = 1;\n",
    ],
    [
      "a.ts",
      "// biome-ignore lint/style/noNonNullAssertion: set above\nconst a = b!;\n",
      "const a = b!;\n",
    ],
    ["a.rs", "/// Docs.\nfn a() {}\n", "fn a() {}\n"],
    ["a.rs", "// SAFETY: plain call.\nunsafe { f() }\n", "unsafe { f() }\n"],
  ])("fails when %s drops a tooling comment", (file, base, work) => {
    expect(compareTokens(file, base, work)).toBeNull();
    const problems = verify(file, base, work);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/tooling comment 0 differs/);
  });

  it("passes when a WHY pointer or a public doc comment is added or dropped", () => {
    const base = "/** Board. */\nexport function a() {}\n";
    const work = "// WHY: quirk. ADR-0010\nexport function a() {}\n";
    expect(verify("ui/core/src/a.ts", base, work)).toEqual([]);
  });

  it("fails when tooling comments change order or text", () => {
    const base = "// @ts-expect-error a\nf();\n// @ts-ignore\ng();\n";
    const swapped = "// @ts-ignore\nf();\n// @ts-expect-error a\ng();\n";
    expect(verify("a.ts", base, swapped)[0]).toMatch(/tooling comment 0/);
  });

  it("passes when only prose goes and tooling only moves its indentation", () => {
    const base =
      "function a() {\n  // why\n  /**\n   * @deprecated old\n   */\n  return 1;\n}\n";
    const work =
      "function a() {\n    /**\n     * @deprecated old\n     */\n  return 1;\n}\n";
    expect(verify("a.ts", base, work)).toEqual([]);
  });

  it("lets a biome-ignore explanation be reworded but not its rule", () => {
    const base = "// biome-ignore lint/a/b: see above.\ntype A = void;\n";
    const reworded =
      "// biome-ignore lint/a/b: only void fits.\ntype A = void;\n";
    const otherRule = "// biome-ignore lint/a/c: see above.\ntype A = void;\n";
    expect(verify("a.ts", base, reworded)).toEqual([]);
    expect(verify("a.ts", base, otherRule)).toHaveLength(1);
  });

  it("skips the token check for an allowed file but still checks tooling", () => {
    expect(verify("a.ts", "const a = 1;\n", "const a = 2;\n")).toHaveLength(1);
    expect(verify("a.ts", "const a = 1;\n", "const a = 2;\n", true)).toEqual(
      [],
    );
    expect(
      verify("a.ts", "// @ts-ignore\nconst a = 1;\n", "const a = 2;\n", true),
    ).toHaveLength(1);
  });
});

describe("comments:verify import runs", () => {
  it("compares a run of imports and re-exports as a sorted multiset", () => {
    const base = [
      'import { b } from "./b";',
      "// separates the chunks",
      'import { a } from "./a";',
      'export { c } from "./c";',
      "",
      "const x = a + b;",
    ].join("\n");
    const work = [
      'export { c } from "./c";',
      'import { a } from "./a";',
      'import { b } from "./b";',
      "",
      "const x = a + b;",
    ].join("\n");
    expect(compareTokens("a.ts", base, work)).toBeNull();
  });

  it("still catches a changed, dropped or duplicated import", () => {
    const base = 'import { a } from "./a";\nimport { b } from "./b";\nf();\n';
    expect(
      compareTokens("a.ts", base, 'import { a } from "./a";\nf();\n'),
    ).not.toBeNull();
    expect(
      compareTokens(
        "a.ts",
        base,
        'import { a } from "./a";\nimport { a } from "./a";\nf();\n',
      ),
    ).not.toBeNull();
    expect(
      compareTokens(
        "a.ts",
        base,
        'import { a } from "./a";\nimport { c } from "./b";\nf();\n',
      ),
    ).not.toBeNull();
  });

  it("does not sort imports across a statement between them", () => {
    const base = 'import { b } from "./b";\nf();\nimport { a } from "./a";\n';
    const work = 'import { a } from "./a";\nf();\nimport { b } from "./b";\n';
    expect(compareTokens("a.ts", base, work)).not.toBeNull();
  });
});

describe("argument parsing", () => {
  it("keeps every value of a repeated flag", () => {
    const args = parseArgs(
      ["--allow", "a.ts", "src", "--allow=b.mjs", "--json"],
      ["allow"],
    );
    expect(args.values("allow")).toEqual(["a.ts", "b.mjs"]);
    expect(args.values("base")).toEqual([]);
    expect(args.positional).toEqual(["src"]);
    expect(args.flags.has("json")).toBe(true);
  });
});
