import { expect, test } from "vitest";
import type { AssistantOperation } from "./catalog";
import { confirmationSummary } from "./summary";

/**
 * A3 — what the user reads is what would happen.
 *
 * Arguments are shown WHOLE: approving a file write must never mean approving
 * bytes the person never saw, and two different writes must never read
 * identically. Short arguments fit the one-line `title`; anything long or
 * multi-line moves to `detail`, which the card renders as its own scrollable
 * block. The one case that is not shown whole says so in words, with the exact
 * size of what is still coming.
 */

const op = (
  name: string,
  description: string,
  confirm = true,
): AssistantOperation =>
  ({
    name,
    group: "g",
    description,
    confirm,
    hidden: false,
    params: [],
    returns: {},
    route: null,
  }) as unknown as AssistantOperation;

test("short arguments read as one plain sentence", () => {
  expect(
    confirmationSummary(
      op("deleteAgent", "Delete an agent and everything in it"),
      {
        id: "Personal/Dobby",
      },
    ),
  ).toEqual({
    title:
      'Delete an agent and everything in it. This affects id "Personal/Dobby".',
  });
});

test("an operation with no arguments is just its own sentence", () => {
  expect(confirmationSummary(op("wipe", "Erase everything."), {})).toEqual({
    title: "Erase everything.",
  });
});

test("undefined arguments are not shown, because they are not sent", () => {
  expect(
    confirmationSummary(op("del", "Delete it."), {
      id: "a",
      note: undefined,
    }),
  ).toEqual({ title: 'Delete it. This affects id "a".' });
});

test("a long value is shown in full, out of the sentence and into the detail block", () => {
  const content = `line one\nline two\n${"x".repeat(500)}`;
  const summary = confirmationSummary(
    op("writeAgentFile", "Write a file inside an agent."),
    { agentId: "Personal/Dobby", relPath: "notes.md", content },
  );
  // The title stays one line: it is what the card asks.
  expect(summary.title).toBe(
    'Write a file inside an agent. This affects agent id "Personal/Dobby", rel path "notes.md".',
  );
  expect(summary.title).not.toContain("\n");
  expect(summary.detail).toContain("The exact content is:");
  expect(summary.detail).toContain(content);
});

/**
 * The reproduction: two writes that differ only past the old 120-character cut
 * produced the SAME card text, so one approval could be spent on either.
 */
test("two values differing late produce different cards", () => {
  const write = op("writeAgentFile", "Write a file.");
  const a = confirmationSummary(write, { content: `${"a".repeat(200)}KEEP` });
  const b = confirmationSummary(write, { content: `${"a".repeat(200)}WIPE` });
  expect(a).not.toEqual(b);
  expect(a.detail).toContain("KEEP");
  expect(b.detail).toContain("WIPE");
});

test("past the limit the card says how much it is not showing, never a bare ellipsis", () => {
  const content = "y".repeat(2_500);
  const summary = confirmationSummary(op("writeAgentFile", "Write a file."), {
    content,
  });
  expect(summary.detail).toContain("and 500 more characters");
  expect(summary.detail).toContain("would be written");
  expect(summary.detail).not.toMatch(/[^.]\.\.\.$/);
});

test("argument names are humanized, never shown as code", () => {
  const summary = confirmationSummary(op("del", "Delete it."), {
    agentPath: "Work/Ada",
    routine_id: "r1",
  });
  expect(summary.title).toContain('agent path "Work/Ada"');
  expect(summary.title).toContain('routine id "r1"');
  expect(summary.detail).toBeUndefined();
});
