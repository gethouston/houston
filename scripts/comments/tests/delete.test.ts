import { describe, expect, it } from "vitest";
import { deleteComments } from "../delete.ts";
import { requireLang, scanSource } from "../scan.ts";

const strip = (file: string, lines: readonly string[]): string => {
  const text = lines.join("\n");
  const prose = scanSource(file, text, []).filter(
    (comment) => comment.role === "prose",
  );
  return deleteComments(text, prose, requireLang(file));
};

describe("deleting comments", () => {
  it("removes an own-line comment's lines and a trailing comment's tail", () => {
    const out = strip("a.ts", [
      "function f() {",
      "  // own line",
      "  // continued",
      "  return 1; // trailing",
      "}",
      "",
    ]);
    expect(out).toBe("function f() {\n  return 1;\n}\n");
  });

  it("removes a multi-line block and keeps code after it on its last line", () => {
    const out = strip("a.ts", [
      "/* one",
      "   two */ const a = 1;",
      "f(/* why */ a, b);",
      "",
    ]);
    expect(out).toBe("const a = 1;\nf(a, b);\n");
  });

  it("collapses blank runs and drops blanks after an opening or before a closing brace", () => {
    const out = strip("a.ts", [
      "const a = 1;",
      "",
      "// gone",
      "",
      "const b = {",
      "",
      "  // gone",
      "  c: 1,",
      "",
      "  // gone",
      "};",
      "",
    ]);
    expect(out).toBe("const a = 1;\n\nconst b = {\n  c: 1,\n};\n");
  });

  it("removes a JSX comment container, and its line when nothing else is on it", () => {
    const out = strip("a.tsx", [
      "const x = (",
      "  <div>",
      "    {/* gone */}",
      "    <p>{/* inline */}text</p>",
      "  </div>",
      ");",
      "",
    ]);
    expect(out).toBe("const x = (\n  <div>\n    <p>text</p>\n  </div>\n);\n");
  });

  it("never deletes tooling comments", () => {
    const out = strip("a.ts", [
      "// @ts-expect-error fake",
      "f(1); // prose",
      "",
    ]);
    expect(out).toBe("// @ts-expect-error fake\nf(1);\n");
  });

  it("deletes from Rust, CSS and shell", () => {
    expect(strip("a.rs", ["/// doc", "fn a() {} // why", ""])).toBe(
      "/// doc\nfn a() {}\n",
    );
    expect(
      strip("a.css", [
        "a {",
        "  /* why */",
        "  color: red; /* tail */",
        "}",
        "",
      ]),
    ).toBe("a {\n  color: red;\n}\n");
    expect(strip("a.sh", ["#!/bin/sh", "# why", "echo hi # tail", ""])).toBe(
      "#!/bin/sh\necho hi\n",
    );
  });

  it("keeps a space where a CSS comment sat between two tokens with none", () => {
    expect(strip("a.css", ["a/* why */:hover {}", ""])).toBe("a :hover {}\n");
    expect(strip("a.css", ["a {}/* why */b {}", ""])).toBe("a {} b {}\n");
    expect(strip("a.css", ["a, /* why */ b {}", ""])).toBe("a, b {}\n");
    expect(strip("a.ts", ["f(1,/* why */2);", ""])).toBe("f(1,2);\n");
  });
});
