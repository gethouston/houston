import { describe, expect, it } from "vitest";
import {
  type AnonymizeAiResult,
  collectAnonymizeItems,
  mergeAnonymizeResults,
} from "./anonymize-ai";
import type { PortableContent } from "./portable";

const content = {
  claudeMd: "You assist Julian (julian@acme.com) at Acme Corp.",
  skills: [{ slug: "mailer", body: "Draft emails for Acme clients." }],
  routines: [
    {
      id: "r1",
      name: "Morning digest",
      prompt: "Summarize Acme's inbox for Julian.",
    },
  ],
  learnings: [{ id: "l1", text: "Julian prefers short replies." }],
} as unknown as PortableContent;

describe("collectAnonymizeItems", () => {
  it("flattens every piece with stable ids and regex pre-redaction", () => {
    const items = collectAnonymizeItems(content);
    expect(items.map((i) => i.id)).toEqual([
      "claudeMd",
      "skill:mailer",
      "routine:r1:name",
      "routine:r1:prompt",
      "learning:l1",
    ]);
    // The email is regex-scrubbed BEFORE the model ever sees the text.
    expect(items[0]?.text).toContain("<email>");
    expect(items[0]?.text).not.toContain("julian@acme.com");
  });

  it("skips absent claudeMd", () => {
    const items = collectAnonymizeItems({
      skills: [],
      routines: [],
      learnings: [],
    } as unknown as PortableContent);
    expect(items).toEqual([]);
  });
});

describe("mergeAnonymizeResults", () => {
  const results = new Map<string, AnonymizeAiResult>([
    [
      "claudeMd",
      {
        text: "You assist <name> (<email>) at <company>.",
        summary: "redacted a name and a company",
      },
    ],
    [
      "skill:mailer",
      {
        text: "Draft emails for <company> clients.",
        summary: "redacted a company",
      },
    ],
    [
      "routine:r1:name",
      { text: "Morning digest", summary: "no personal info detected" },
    ],
    [
      "routine:r1:prompt",
      {
        text: "Summarize <company>'s inbox for <name>.",
        summary: "redacted a name and a company",
      },
    ],
    [
      "learning:l1",
      { text: "<name> prefers short replies.", summary: "redacted a name" },
    ],
  ]);

  it("builds the wizard response from the model's redactions", () => {
    const res = mergeAnonymizeResults(content, results);
    expect(res.mode).toBe("ai");
    expect(res.claudeMd?.before).toContain("julian@acme.com");
    expect(res.claudeMd?.after).toBe(
      "You assist <name> (<email>) at <company>.",
    );
    // Both passes contributed: regex counts + the model's own summary.
    expect(res.claudeMd?.summary).toBe(
      "redacted 1 email; redacted a name and a company",
    );
    expect(res.skills[0]?.summary).toBe("redacted a company");
    // Unchanged routine name yields no diff; changed prompt yields one.
    expect(res.routines[0]?.fieldDiffs).toEqual([
      {
        field: "prompt",
        before: "Summarize Acme's inbox for Julian.",
        after: "Summarize <company>'s inbox for <name>.",
      },
    ]);
    expect(res.routines[0]?.overridePayload).toEqual({
      prompt: "Summarize <company>'s inbox for <name>.",
    });
    expect(res.learnings[0]?.becameEmpty).toBe(false);
  });

  it("flags placeholder-only results as becameEmpty", () => {
    const res = mergeAnonymizeResults(
      content,
      new Map([...results, ["learning:l1", { text: "<name>.", summary: "s" }]]),
    );
    expect(res.learnings[0]?.becameEmpty).toBe(true);
  });

  it("degrades a missing id to the regex result instead of dropping it", () => {
    const partial = new Map(results);
    partial.delete("skill:mailer");
    const res = mergeAnonymizeResults(content, partial);
    expect(res.skills[0]?.after).toBe("Draft emails for Acme clients.");
    expect(res.skills[0]?.summary).toBe("no obvious personal info detected");
  });
});
