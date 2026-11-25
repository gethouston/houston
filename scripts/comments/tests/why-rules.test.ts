import { describe, expect, it } from "vitest";
import { isWhy } from "../why.ts";
import { scan } from "./support.ts";

const adrs = new Set(["0001"]);
const why = (comment: string): boolean =>
  isWhy("ts", comment, comment.startsWith("//") ? "line" : "block", adrs);
const roles = (lines: readonly string[]): string[] =>
  scan("a.ts", lines).map((comment) => comment.role);
const URL_REF = "https://bugs.webkit.org/show_bug.cgi?id=1";

describe("WHY references", () => {
  it.each([
    "// WHY: the vendor caps titles. ADR-0001",
    `// WHY: Safari drops the event, see ${URL_REF}.`,
    "// WHY: Bun pipes buffer SSE. https://github.com/oven-sh/bun/issues/1",
    "// WHY: see https://docs.github.com/en/rest (ADR-0001)",
  ])("allows %j", (comment) => {
    expect(why(comment)).toBe(true);
  });

  it.each([
    ["an ADR that does not exist", "// WHY: quirk. ADR-0002"],
    ["an issue id next to an ADR", "// WHY: quirk, HOU-12. ADR-0001"],
    ["a PRODUCT issue id", "// WHY: quirk (PRODUCT-2049). ADR-0001"],
    ["an H issue id", "// WHY: quirk H-070. ADR-0001"],
    ["the task tracker", "// WHY: see https://tasks.gethouston.ai/t/1"],
    ["Linear", "// WHY: see https://linear.app/houston/issue/X-1"],
    [
      "a bare tracker host",
      "// WHY: see linear.app/houston/issue/X-1 ADR-0001",
    ],
    [
      "an own issue",
      "// WHY: see https://github.com/gethouston/houston/issues/1",
    ],
    ["an own PR", "// WHY: see https://github.com/gethouston/cloud/pull/2"],
    ["plain http", "// WHY: see http://bugs.webkit.org/1"],
    ["an http URL next to an ADR", "// WHY: see http://example.com ADR-0001"],
    ["an IPv4 host", "// WHY: see https://10.0.0.1/x"],
    ["an IPv6 host", "// WHY: see https://[::1]/x"],
    ["localhost", "// WHY: see https://localhost:4318/v1"],
    ["a single-label host", "// WHY: see https://intranet/x"],
    ["a private suffix", "// WHY: see https://svc.cluster.internal/x"],
  ])("rejects %s", (_, comment) => {
    expect(why(comment)).toBe(false);
  });
});

describe("WHY size", () => {
  it("allows lines up to 140 characters and rejects longer ones", () => {
    const line = (width: number): string =>
      `// WHY: ${"x".repeat(width - 17)} ADR-0001`;
    expect(line(140)).toHaveLength(140);
    expect(why(line(140))).toBe(true);
    expect(why(line(141))).toBe(false);
  });

  it("counts stacked WHY blocks above the same code as one comment", () => {
    expect(
      roles([
        "// WHY: one.",
        `// ${URL_REF}`,
        "",
        `/* WHY: two. ${URL_REF} */`,
        "const x = 1;",
      ]),
    ).toEqual(["why", "why"]);
    expect(
      roles([
        "// WHY: one,",
        `// ${URL_REF}`,
        "",
        "/*",
        " * WHY: two,",
        ` * ${URL_REF}`,
        " */",
        "const x = 1;",
      ]),
    ).toEqual(["prose", "prose"]);
    expect(
      roles([
        `// WHY: one. ${URL_REF}`,
        "",
        `// WHY: two. ${URL_REF}`,
        "",
        `// WHY: three. ${URL_REF}`,
        "",
        `// WHY: four. ${URL_REF}`,
        "const x = 1;",
      ]),
    ).toEqual(["prose", "prose", "prose", "prose"]);
  });

  it("keeps WHY blocks separated by code apart", () => {
    expect(
      roles([
        "// WHY: one,",
        `// ${URL_REF}`,
        "const x = 1;",
        "// WHY: two,",
        `// ${URL_REF}`,
        "const y = 1;",
      ]),
    ).toEqual(["why", "why"]);
  });
});

describe("WHY placement", () => {
  it.each([
    ["a trailing line comment", [`const x = 1; // WHY: quirk. ${URL_REF}`]],
    ["a block before code", [`/* WHY: quirk. ${URL_REF} */ const x = 1;`]],
    ["a block after code", [`const x = 1; /* WHY: quirk. ${URL_REF} */`]],
  ])("counts %s as prose", (_, lines) => {
    expect(roles(lines)).toEqual(["prose"]);
  });

  it("allows a WHY on its own line above the code", () => {
    expect(roles([`  // WHY: quirk. ${URL_REF}`, "  const x = 1;"])).toEqual([
      "why",
    ]);
  });
});
