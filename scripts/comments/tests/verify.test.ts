import { describe, expect, it } from "vitest";
import { compareTokens } from "../verify.ts";

describe("comments:verify token comparison", () => {
  it("passes a pure comment deletion", () => {
    const base = "// why\nconst a = f(1, /* x */ 2); // tail\n";
    expect(compareTokens("a.ts", base, "const a = f(1, 2);\n")).toBeNull();
  });

  it("catches a real token change and names its position", () => {
    const mismatch = compareTokens(
      "a.ts",
      "// why\nconst a = 1;\n",
      "const a = 2;\n",
    );
    expect(mismatch?.base).toEqual({ text: "1", line: 2, col: 11 });
    expect(mismatch?.work).toEqual({ text: "2", line: 1, col: 11 });
  });

  it("treats the empty container a removed JSX comment leaves as removed", () => {
    const base = "const x = <div>\n  {/* why */}\n  <p>hi</p>\n</div>;\n";
    expect(
      compareTokens("a.tsx", base, "const x = <div>{}<p>hi</p></div>;\n"),
    ).toBeNull();
    expect(
      compareTokens("a.tsx", base, "const x = <div>\n  <p>hi</p>\n</div>;\n"),
    ).toBeNull();
  });

  it("ignores the trailing commas, JSX parens and JSX spaces a reformat changes", () => {
    const base =
      'const x = f(\n  a, // why\n  b,\n);\nconst y = (\n  <p>\n    Hi{" "}\n    <b>you</b>\n  </p>\n);\n';
    expect(
      compareTokens(
        "a.tsx",
        base,
        "const x = f(a, b);\nconst y = <p>Hi <b>you</b></p>;\n",
      ),
    ).toBeNull();
  });

  it("catches a JSX text change", () => {
    expect(
      compareTokens(
        "a.tsx",
        "const x = <p>Hi</p>;\n",
        "const x = <p>Ho</p>;\n",
      ),
    ).not.toBeNull();
  });

  it("catches changes in Rust, CSS and shell code", () => {
    expect(compareTokens("a.rs", "fn a() {} // x\n", "fn a() {}\n")).toBeNull();
    expect(compareTokens("a.rs", "fn a() {}\n", "fn b() {}\n")).not.toBeNull();
    expect(
      compareTokens(
        "a.css",
        "a { color: red; } /* x */\n",
        "a { color: red; }\n",
      ),
    ).toBeNull();
    expect(compareTokens("a.css", "a b {}\n", "ab {}\n")).not.toBeNull();
    expect(
      compareTokens("a.sh", "# x\necho 'a  b'\n", "echo 'a  b'\n"),
    ).toBeNull();
    expect(
      compareTokens("a.sh", "echo 'a  b'\n", "echo 'a b'\n"),
    ).not.toBeNull();
  });
});
