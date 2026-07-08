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
  it("flattens every piece with stable ids and regex pre-redaction", async () => {
    const items = await collectAnonymizeItems(content);
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

  it("skips absent claudeMd", async () => {
    const items = await collectAnonymizeItems({
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

  it("builds the wizard response from the model's redactions", async () => {
    const res = await mergeAnonymizeResults(content, results);
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

  it("flags placeholder-only results as becameEmpty", async () => {
    const res = await mergeAnonymizeResults(
      content,
      new Map([...results, ["learning:l1", { text: "<name>.", summary: "s" }]]),
    );
    expect(res.learnings[0]?.becameEmpty).toBe(true);
  });

  it("degrades a missing id to the regex result instead of dropping it", async () => {
    const partial = new Map(results);
    partial.delete("skill:mailer");
    const res = await mergeAnonymizeResults(content, partial);
    expect(res.skills[0]?.after).toBe("Draft emails for Acme clients.");
    expect(res.skills[0]?.summary).toBe("no obvious personal info detected");
  });
});

describe("secret redactor seam", () => {
  // A fake secret pass: any FAKEKEY token becomes <secret>.
  const redactSecrets = async (text: string) => {
    const count = (text.match(/FAKEKEY\w+/g) ?? []).length;
    return { text: text.replace(/FAKEKEY\w+/g, "<secret>"), count };
  };
  const withKey = {
    skills: [],
    routines: [],
    learnings: [{ id: "l1", text: "Token FAKEKEY123 mails julian@acme.com." }],
  } as unknown as PortableContent;

  it("scrubs secrets from the items sent to the model", async () => {
    const items = await collectAnonymizeItems(withKey, redactSecrets);
    expect(items[0]?.text).toBe("Token <secret> mails <email>.");
  });

  it("counts secrets in the pre-pass summary on merge", async () => {
    const res = await mergeAnonymizeResults(
      withKey,
      new Map([
        [
          "learning:l1",
          {
            text: "Token <secret> mails <email>.",
            summary: "no personal info detected",
          },
        ],
      ]),
      redactSecrets,
    );
    expect(res.learnings[0]?.after).toBe("Token <secret> mails <email>.");
    expect(res.learnings[0]?.summary).toBe("redacted 1 email, 1 secret");
  });
});
