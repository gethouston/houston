import { expect, test } from "vitest";
import type { AssistantOperation } from "./catalog";
import { confirmationSummary } from "./summary";

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
    args: [{ name: "id", value: "Personal/Dobby", long: false }],
  });
});

test("an operation with no arguments is just its own sentence", () => {
  expect(confirmationSummary(op("wipe", "Erase everything."), {})).toEqual({
    title: "Erase everything.",
    args: [],
  });
});

test("undefined arguments are not shown, because they are not sent", () => {
  expect(
    confirmationSummary(op("del", "Delete it."), {
      id: "a",
      note: undefined,
    }),
  ).toEqual({
    title: 'Delete it. This affects id "a".',
    args: [{ name: "id", value: "a", long: false }],
  });
});

test("a long value is shown in full, out of the sentence and into the detail block", () => {
  const content = `line one\nline two\n${"x".repeat(500)}`;
  const summary = confirmationSummary(
    op("writeAgentFile", "Write a file inside an agent."),
    { agentId: "Personal/Dobby", relPath: "notes.md", content },
  );
  expect(summary.title).toBe(
    'Write a file inside an agent. This affects agent id "Personal/Dobby", rel path "notes.md".',
  );
  expect(summary.title).not.toContain("\n");
  expect(summary.detail).toContain("The exact content is:");
  expect(summary.detail).toContain(content);
});

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

test("every argument travels structurally, with the host's own wording beside it", () => {
  const content = `line one\nline two\n${"x".repeat(500)}`;
  const summary = confirmationSummary(op("writeAgentFile", "Write a file."), {
    agentId: "Personal/Dobby",
    content,
    skipped: undefined,
  });

  expect(summary.args).toEqual([
    { name: "agentId", value: "Personal/Dobby", long: false },
    { name: "content", value: content, long: true },
  ]);
});

test("a value past the limit says how much it cut, structurally too", () => {
  const summary = confirmationSummary(op("writeAgentFile", "Write a file."), {
    content: "y".repeat(2_500),
  });

  expect(summary.args).toHaveLength(1);
  expect(summary.args[0]?.value).toHaveLength(2_000);
  expect(summary.args[0]?.truncated).toBe(500);
  expect(summary.detail).toContain("and 500 more characters");
});

test("nested object and array arguments read as labeled facts without JSON", () => {
  const summary = confirmationSummary(
    op("updateActivity", "Update a mission."),
    {
      patch: { title: "Collect receipts", members: ["Ada", "Sam"] },
    },
  );

  expect(summary.args).toEqual([
    { name: "patch.title", value: "Collect receipts", long: false },
    { name: "patch.members 1", value: "Ada", long: false },
    { name: "patch.members 2", value: "Sam", long: false },
  ]);
  expect(`${summary.title} ${summary.detail ?? ""}`).not.toMatch(/[{}[\]\\]/);
  expect(summary.title).toContain("patch title");
});

test("a hire's starting instructions reach the card whole", () => {
  const claudeMd = `---\nrole: Collector\n---\n\n${"Follow up. ".repeat(250)}`;
  const summary = confirmationSummary(
    op("createAgent", "Hire an AI Employee."),
    {
      name: "Document Collector",
      seed: { claudeMd },
    },
  );
  expect(summary.args.find((arg) => arg.name === "seed.claudeMd")?.value).toBe(
    claudeMd,
  );
  expect(summary.title).toBe("Hire Document Collector?");
  expect(summary.detail).toContain("Role: Collector");
  expect(summary.detail).toContain("Instructions:\nFollow up.");
  expect(summary.detail).not.toContain("---");
  expect(summary.detail).not.toContain("{");
});

test("two different calls never read identically", () => {
  const read = (params: Record<string, unknown>) =>
    confirmationSummary(op("set", "Set it."), params).args;
  expect(read({ field: null })).not.toEqual(read({ field: "none" }));
  expect(read({ field: { a: { "b.c": 1 } } })).not.toEqual(
    read({ field: { a: { b: { c: 1 } } } }),
  );
  expect(read({ field: "none" })).not.toEqual(read({ field: '"none"' }));
  expect(read({ allowedModels: null })).not.toEqual(
    read({ allowedModels: [] }),
  );
  expect(read({ field: [] })).not.toEqual(read({ field: {} }));
  expect(read({ x: { a: ["v"] } })).not.toEqual(read({ x: { "a 1": "v" } }));
});

test("a long list stays one argument, cut where the card says so", () => {
  const items = Array.from({ length: 5000 }, (_, i) => `item-${i}`);
  const args = confirmationSummary(op("set", "Set it."), { items }).args;
  expect(args).toHaveLength(1);
  expect(args[0]).toMatchObject({ name: "items", long: true });
  expect(args[0]?.truncated).toBeGreaterThan(0);
});
