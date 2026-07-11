import { describe, expect, it } from "vitest";
import { parseAnonymizeResult } from "./anonymize-parse";

const requested = [
  { id: "claudeMd", text: "You work for Acme." },
  { id: "skill:mailer", text: "Email <email> daily." },
];

describe("parseAnonymizeResult", () => {
  it("maps results back in request order", () => {
    const raw = JSON.stringify({
      items: [
        {
          id: "skill:mailer",
          text: "Email <email> daily.",
          summary: "no personal info detected",
        },
        {
          id: "claudeMd",
          text: "You work for <company>.",
          summary: "redacted a company",
        },
      ],
    });
    const out = parseAnonymizeResult(raw, requested);
    expect(out.map((i) => i.id)).toEqual(["claudeMd", "skill:mailer"]);
    expect(out[0]?.text).toBe("You work for <company>.");
    expect(out[0]?.summary).toBe("redacted a company");
  });

  it("tolerates markdown fences and missing summary", () => {
    const raw = `\`\`\`json\n${JSON.stringify({
      items: requested.map((r) => ({ id: r.id, text: r.text })),
    })}\n\`\`\``;
    const out = parseAnonymizeResult(raw, requested);
    expect(out).toHaveLength(2);
    expect(out[1]?.summary).toBe("");
  });

  it("throws when an id is missing (a dropped item would ship unredacted)", () => {
    const raw = JSON.stringify({
      items: [{ id: "claudeMd", text: "x", summary: "" }],
    });
    expect(() => parseAnonymizeResult(raw, requested)).toThrow(
      /missing item 'skill:mailer'/,
    );
  });

  it("throws on junk", () => {
    expect(() => parseAnonymizeResult("not json", requested)).toThrow(
      /JSON parse failed/,
    );
    expect(() => parseAnonymizeResult("{}", requested)).toThrow(
      /'items' array/,
    );
  });

  it("ignores malformed and unknown entries", () => {
    const raw = JSON.stringify({
      items: [
        null,
        { id: 42, text: "x" },
        { id: "unknown", text: "x" },
        { id: "claudeMd", text: "a", summary: "s" },
        { id: "skill:mailer", text: "b", summary: "t" },
      ],
    });
    expect(parseAnonymizeResult(raw, requested)).toHaveLength(2);
  });
});
