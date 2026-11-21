import { describe, expect, it } from "vitest";
import { tokensOf } from "../scan.ts";
import { compareTokens } from "../verify.ts";
import { texts } from "./support.ts";

describe("Rust lexer", () => {
  it("skips raw strings, byte strings and chars, and keeps lifetimes apart", () => {
    const found = texts("a.rs", [
      'const A: &str = r#"// not "a" comment /* no */"#;',
      'const B: &str = r##"has "# inside // still"##;',
      'const C: &[u8] = br"/* bytes */";',
      'const D: &[u8] = b"// bytes";',
      "const E: char = '\"';",
      "const F: char = '\\'';",
      "const G: u8 = b'/';",
      "fn f<'a>(x: &'a str) -> &'a str { let q = \"\\\"//\"; x } // real",
      "const H: char = '/'; /* also real */",
    ]);
    expect(found).toEqual(["// real", "/* also real */"]);
  });

  it("reads nested block comments as one comment", () => {
    expect(
      texts("a.rs", ["/* outer /* inner */ still outer */ fn a() {}"]),
    ).toEqual(["/* outer /* inner */ still outer */"]);
  });

  it("keeps a raw identifier as code", () => {
    expect(texts("a.rs", ["let r#type = 1; // after"])).toEqual(["// after"]);
  });
});

describe("CSS lexer", () => {
  it("skips comment markers inside strings", () => {
    const found = texts("a.css", [
      'a::before { content: "/* not */"; }',
      "b { background: url('//cdn/x.png'); } /* real */",
    ]);
    expect(found).toEqual(["/* real */"]);
  });

  it("reads an unquoted url( ... ) as one token, so /* inside it is not a comment", () => {
    const css = "a { background: url(data:x/y;a/*b*/c); } /* real */";
    expect(texts("a.css", [css])).toEqual(["/* real */"]);
    expect(tokensOf("a.css", css).map((t) => t.text)).toContain(
      "url(data:x/y;a/*b*/c)",
    );
    expect(texts("a.css", ['a { b: url( "/*x*/" ); } /* real */'])).toEqual([
      "/* real */",
    ]);
  });

  it("keeps the whitespace that changes a selector or a calc()", () => {
    const changes = (base: string, work: string) =>
      compareTokens("a.css", base, work) !== null;
    expect(changes("a :hover {}", "a:hover {}")).toBe(true);
    expect(changes("a [x] {}", "a[x] {}")).toBe(true);
    expect(changes("a * {}", "a* {}")).toBe(true);
    expect(
      changes("a { width: calc(1px + 2px); }", "a { width: calc(1px+ 2px); }"),
    ).toBe(true);
    expect(changes("a ~ b {}", "a~ b {}")).toBe(true);
    expect(changes("a > b {}", "a> b {}")).toBe(true);
    expect(changes("a /* x */ :hover {}", "a :hover {}")).toBe(false);
    expect(changes("a{color:red}", "a { color:red}")).toBe(false);
  });
});

describe("shell lexer", () => {
  it("finds # only where a word starts, outside quotes and heredocs", () => {
    const found = texts("a.sh", [
      "#!/usr/bin/env bash",
      "echo \"# no\" '# no' a#b $" + "{#arr[@]} $# \\#no",
      "echo $(( 16#ff ))",
      "cat <<EOF",
      "# heredoc body",
      "EOF",
      "cat <<-'END'",
      "\t# tabbed body",
      "\tEND",
      'grep -q x <<<"$OUT" # real one',
      "x=$(printf '%s' \"#\") # real two",
      "# real three",
    ]);
    expect(found).toEqual(["# real one", "# real two", "# real three"]);
  });

  it("refuses an unterminated heredoc", () => {
    expect(() => texts("a.sh", ["cat <<EOF", "body"])).toThrow(/never ends/);
  });
});
