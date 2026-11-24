import { describe, expect, it } from "vitest";
import { scan } from "./support.ts";

const roles = (file: string, lines: readonly string[]): string[] =>
  scan(file, lines).map((comment) => comment.role);

describe("WHY comments", () => {
  it.each([
    "// WHY: Gemini via pi omits totalTokens; sum the parts. ADR-0010",
    "/* WHY: Safari drops the event, see https://bugs.webkit.org/show_bug.cgi?id=1 */",
    "/**\n * WHY: the vendor caps titles at 200 code points.\n * ADR-0010\n */",
  ])("allows %j", (comment) => {
    expect(roles("a.ts", [comment, "export const x = 1;"])).toEqual(["why"]);
  });

  it("allows a WHY comment over three lines with the reference on the last", () => {
    const found = scan("a.ts", [
      "// WHY: pi emits turn_start before it appends the messages,",
      "// so the send supplies the prompt size.",
      "// ADR-0010",
      "const x = 1;",
    ]);
    expect(found.map((c) => [c.line, c.endLine, c.role])).toEqual([
      [1, 3, "why"],
    ]);
  });

  it.each([
    ["untagged prose", "// Gemini via pi omits totalTokens. ADR-0010"],
    ["no reference", "// WHY: keep this for now"],
    ["a missing ADR", "// WHY: the order matters. ADR-0999"],
    ["one missing ADR among valid ones", "// WHY: see ADR-0010 and ADR-0999"],
    ["an internal issue id", "// WHY: the pod sleeps early. HOU-123"],
    ["a TODO", "// TODO: drop this once pi ships the fix. ADR-0010"],
    ["a local URL", "// WHY: the dev host answers at http://localhost:4318"],
    ["WHY mid-line", "// The WHY: ADR-0010"],
  ])("counts %s as prose", (_, comment) => {
    expect(roles("a.ts", [comment, "const x = 1;"])).toEqual(["prose"]);
  });

  it("counts a WHY comment of four lines as one prose comment", () => {
    expect(
      roles("a.ts", [
        "// WHY: one",
        "// two",
        "// three",
        "// four ADR-0010",
        "const x = 1;",
      ]),
    ).toEqual(["prose"]);
    expect(
      roles("a.ts", [
        "/*",
        " * WHY: one",
        " * two",
        " * three",
        " * four ADR-0010",
        " */",
        "const x = 1;",
      ]),
    ).toEqual(["prose"]);
  });

  it("keeps prose above a WHY comment as its own prose comment", () => {
    expect(
      roles("a.ts", ["// Prose.", "// WHY: quirk. ADR-0010", "const x = 1;"]),
    ).toEqual(["prose", "why"]);
  });

  it("applies the same rule to Rust, CSS and shell", () => {
    expect(roles("a.rs", ["// WHY: quirk. ADR-0010", "fn a() {}"])).toEqual([
      "why",
    ]);
    expect(roles("a.rs", ["// WHY: keep this", "fn a() {}"])).toEqual([
      "prose",
    ]);
    expect(roles("a.css", ["/* WHY: quirk. ADR-0010 */", "a {}"])).toEqual([
      "why",
    ]);
    expect(roles("a.sh", ["# WHY: quirk. ADR-0010", "echo"])).toEqual(["why"]);
  });

  it("allows a WHY comment inside JSX", () => {
    expect(
      roles("a.tsx", [
        "const a = (",
        "  <div>",
        "    {/* WHY: quirk. ADR-0010 */}",
        "  </div>",
        ");",
      ]),
    ).toEqual(["why"]);
  });
});
