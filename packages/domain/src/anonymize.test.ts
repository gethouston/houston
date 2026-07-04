import { expect, test } from "vitest";
import { anonymizeContent, redactString, redactText } from "./anonymize";
import { applyOverrides } from "./portable-edit";
import { createRoutine } from "./routines";

/**
 * The heuristic anonymizer — ported from the Rust engine's
 * `portable/anonymize.rs`; the first five cases mirror its unit tests.
 */

test("redacts emails and user paths", () => {
  const s =
    "Reach Alice at alice@example.com or open /Users/julian/work/notes.md.";
  const r = redactText(s);
  expect(r).toContain("<email>");
  expect(r).toContain("/Users/<user>");
  expect(r).not.toContain("alice@example.com");
  expect(r).not.toContain("julian");
});

test("redacts phone numbers", () => {
  const r = redactText("Call us at +1 555-555-1212.");
  expect(r).toContain("<phone>");
  expect(r).not.toContain("555-1212");
});

test("redacts handles, keeping the surrounding text intact", () => {
  const r = redactText("Ping @alice when ready.");
  expect(r).toContain("<handle>");
  expect(r).toContain("Ping <handle> when ready.");
});

test("a text that is all personal info is flagged becameEmpty", () => {
  const r = redactString("alice@example.com");
  expect(r.after).toBe("<email>");
  expect(r.becameEmpty).toBe(true);
});

test("clean text is unchanged with a no-op summary", () => {
  const r = redactString("Draft the quarterly report.");
  expect(r.after).toBe(r.before);
  expect(r.becameEmpty).toBe(false);
  expect(r.summary).toBe("no obvious personal info detected");
});

test("summary counts what was redacted", () => {
  const r = redactString(
    "Email bob@x.co and carol@y.io about https://internal.example.com",
  );
  expect(r.summary).toContain("2 email");
  expect(r.summary).toContain("1 url");
});

test("anonymizeContent diffs every part and builds routine overrides", () => {
  const routine = createRoutine(
    {
      name: "Mail digest",
      prompt: "Summarize mail from dan@x.co every morning",
      schedule: "0 9 * * *",
    },
    "r1",
    "2026-07-04T00:00:00.000Z",
  );
  const out = anonymizeContent({
    claudeMd: "You help dan@x.co with sales.",
    skills: [{ slug: "outreach", body: "Email prospects at their @handles" }],
    routines: [routine],
    learnings: [
      {
        id: "l1",
        text: "Nothing personal here.",
        created_at: "2026-07-04T00:00:00.000Z",
      },
    ],
  });

  expect(out.claudeMd?.after).toBe("You help <email> with sales.");
  expect(out.skills[0]?.id).toBe("outreach");
  expect(out.routines[0]?.fieldDiffs).toEqual([
    {
      field: "prompt",
      before: "Summarize mail from dan@x.co every morning",
      after: "Summarize mail from <email> every morning",
    },
  ]);
  expect(out.routines[0]?.overridePayload).toEqual({
    prompt: "Summarize mail from <email> every morning",
  });
  expect(out.learnings[0]?.after).toBe("Nothing personal here.");
});

test("applyOverrides swaps in accepted diffs and leaves the rest", () => {
  const routine = createRoutine(
    { name: "Daily", prompt: "mail dan@x.co", schedule: "0 9 * * *" },
    "r1",
    "2026-07-04T00:00:00.000Z",
  );
  const content = {
    claudeMd: "original",
    skills: [
      { slug: "a", body: "keep" },
      { slug: "b", body: "replace" },
    ],
    routines: [routine],
    learnings: [
      { id: "l1", text: "old", created_at: "2026-07-04T00:00:00.000Z" },
    ],
  };
  const out = applyOverrides(content, {
    claudeMd: "redacted",
    skillBodies: { b: "redacted body" },
    routineFields: { r1: { prompt: "mail <email>" } },
    learningTexts: { l1: "new" },
  });
  expect(out.claudeMd).toBe("redacted");
  expect(out.skills.map((s) => s.body)).toEqual(["keep", "redacted body"]);
  expect(out.routines[0]?.prompt).toBe("mail <email>");
  expect(out.routines[0]?.name).toBe("Daily");
  expect(out.learnings[0]?.text).toBe("new");
  expect(applyOverrides(content, undefined)).toEqual(content);
});
