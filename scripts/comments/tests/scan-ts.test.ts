import { describe, expect, it } from "vitest";
import { scan, texts } from "./support.ts";

describe("TS/JS scanning", () => {
  it("never reports // or /* inside strings, templates, regex or JSX text", () => {
    const found = texts("a.tsx", [
      'const a = "// not a comment";',
      "const b = '/* nor this */';",
      "const c = `// tpl $" + "{'/* inner */' + `/* nested */`} /* tail */`;",
      "const d = /\\/\\/ x \\/* y/g.test(a) ? 1 : 2;",
      "const e = <p>// jsx text /* also text */ {a}</p>;",
      'const f = <a href="//cdn/*x*/" />;',
      "type T = `// $" + "{string} /* t */`;",
      "const g = a / b / c;",
      "// real",
    ]);
    expect(found).toEqual(["// real"]);
  });

  it("skips the shebang", () => {
    expect(texts("bin.mjs", ["#!/usr/bin/env node", "run(); // go"])).toEqual([
      "// go",
    ]);
  });

  it("reports a JSX comment as one comment whose range includes the braces", () => {
    const [comment] = scan("a.tsx", [
      "const x = (",
      "  <div>",
      "    {/* first */ /* second */}",
      "    <span />",
      "  </div>",
      ");",
    ]);
    expect(comment.kind).toBe("jsx");
    expect(comment.text).toBe("{/* first */ /* second */}");
    expect(comment.id).toBe("a.tsx:3:5");
  });

  it("keeps a comment inside a non-empty JSX expression as a plain comment", () => {
    const [comment] = scan("a.tsx", ["const x = <p>{/* why */ value}</p>;"]);
    expect(comment.kind).toBe("block");
    expect(comment.text).toBe("/* why */");
  });

  it("groups consecutive own-line // lines into one comment", () => {
    const found = texts("a.ts", [
      "// one",
      "// two",
      "const a = 1;",
      "// three",
      "",
      "// four",
      "const b = 2; // five",
      "const c = 3; // six",
    ]);
    expect(found).toEqual([
      "// one\n// two",
      "// three",
      "// four",
      "// five",
      "// six",
    ]);
  });

  it("does not merge a tooling line into the prose above it", () => {
    const found = scan("a.ts", [
      "// why this is ignored",
      "// biome-ignore lint/style/noNonNullAssertion: checked above",
      "const a = b!;",
    ]).map((comment) => [comment.text, comment.role === "tooling"]);
    expect(found).toEqual([
      ["// why this is ignored", false],
      ["// biome-ignore lint/style/noNonNullAssertion: checked above", true],
    ]);
  });

  it("refuses a file that does not parse", () => {
    expect(() => scan("a.ts", ["const = ;"])).toThrow(/does not parse/);
  });
});
