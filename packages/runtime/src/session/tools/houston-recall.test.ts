import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";

/**
 * `houston_recall` reads the LIVE transcript store, so the data dir has to be a
 * throwaway before the module graph loads (store/conversations binds
 * `config.dataDir` at import). Fixtures are written through the store's own
 * dir-parameterized writer, which is also what lets a case pin an exact `ts`
 * (or omit it, as pre-`ts` transcripts do).
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-recall-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-recall-ws-"),
);

const { config } = await import("../../config");
const { saveConversation } = await import("../../store/conversation-file");
const { runWithConversationId } = await import("../conversation-context");
const { HOUSTON_RECALL_TOOL_NAME, makeHoustonRecallTool } = await import(
  "./houston-recall"
);
type HoustonRecallDetails = import("./houston-recall").HoustonRecallDetails;

const dir = join(config.dataDir, "conversations");
const tool = makeHoustonRecallTool();
const CTX = {} as unknown as ExtensionContext;

let seq = 0;
/** Seed one conversation and answer with its id. */
function seed(messages: ChatMessage[]): string {
  const id = `assistant-${seq++}`;
  const now = Date.now();
  saveConversation(dir, {
    id,
    title: "Assistant",
    createdAt: now,
    updatedAt: now,
    messages,
  });
  return id;
}

const at = (iso: string) => new Date(iso).getTime();

const msg = (
  role: ChatMessage["role"],
  content: string,
  ts = at("2026-01-15T10:30:00.000Z"),
): ChatMessage => ({ role, content, ts });

interface ToolOutput {
  content: Array<{ type: string; text?: string }>;
  details: unknown;
}

const run = (params: unknown, conversationId?: string) =>
  runWithConversationId(conversationId, () =>
    tool.execute("call-1", params as never, undefined, undefined, CTX),
  ) as Promise<ToolOutput>;

const textOf = (out: ToolOutput) =>
  out.content.map((c) => c.text ?? "").join("");
const detailsOf = (out: ToolOutput) => out.details as HoustonRecallDetails;

test("is named houston_recall and takes a query plus an optional limit", () => {
  expect(tool.name).toBe(HOUSTON_RECALL_TOOL_NAME);
  const params = tool.parameters as unknown as {
    properties: Record<string, unknown>;
    required?: string[];
  };
  expect(Object.keys(params.properties)).toEqual(["query", "limit"]);
  expect(params.required).toEqual(["query"]);
});

test("returns matching messages newest first, with role, ISO time and context", async () => {
  const id = seed([
    msg("user", "The dentist is Dr Ruiz #m0", at("2026-01-01T09:00:00.000Z")),
    msg("assistant", "Noted, Dr Ruiz #m1", at("2026-01-02T09:00:00.000Z")),
    msg("user", "Book the dentist again #m2", at("2026-03-04T18:45:00.000Z")),
  ]);
  const out = await run({ query: "dentist" }, id);
  const text = textOf(out);
  expect(detailsOf(out)).toEqual({
    outcome: "searched",
    query: "dentist",
    matched: 2,
    returned: 2,
    totalMessages: 3,
  });
  expect(text.indexOf("#m2")).toBeLessThan(text.indexOf("#m0"));
  // The role, an ISO instant, and the words around the match all survive.
  expect(text).toContain("[user - 2026-03-04T18:45:00.000Z]");
  expect(text).toContain("Book the dentist again #m2");
  expect(text).toContain("The dentist is Dr Ruiz #m0");
  // The assistant reply mentions Dr Ruiz but not the query word.
  expect(text).not.toContain("#m1");
});

test("matches case-insensitively in both directions", async () => {
  const id = seed([
    msg("user", "Flying to LISBON in June"),
    msg("assistant", "Booked your lisbon trip"),
  ]);
  for (const query of ["lisbon", "LISBON", "LiSbOn"]) {
    const out = await run({ query }, id);
    expect(detailsOf(out)).toMatchObject({ matched: 2, returned: 2 });
  }
});

test("no match reports what it searched and asks for different words", async () => {
  const id = seed([msg("user", "Flying to Lisbon in June")]);
  const out = await run({ query: "zebra" }, id);
  expect(textOf(out)).toContain(
    'Nothing in your conversation with the user matches "zebra"',
  );
  expect(textOf(out)).toContain("searched all 1 messages");
  expect(textOf(out)).toContain("Try a different word");
  expect(detailsOf(out)).toEqual({
    outcome: "searched",
    query: "zebra",
    matched: 0,
    returned: 0,
    totalMessages: 1,
  });
});

test("a conversation with nothing stored yet is a plain no-match", async () => {
  const out = await run({ query: "anything" }, "never-written");
  expect(detailsOf(out)).toEqual({
    outcome: "searched",
    query: "anything",
    matched: 0,
    returned: 0,
    totalMessages: 0,
  });
});

test("limit caps the hits returned while the count stays honest", async () => {
  const id = seed([
    msg("user", "invoice one #m0", at("2026-01-01T09:00:00.000Z")),
    msg("user", "invoice two #m1", at("2026-01-02T09:00:00.000Z")),
    msg("user", "invoice three #m2", at("2026-01-03T09:00:00.000Z")),
  ]);
  const out = await run({ query: "invoice", limit: 1 }, id);
  expect(detailsOf(out)).toMatchObject({ matched: 3, returned: 1 });
  expect(textOf(out)).toContain("#m2");
  expect(textOf(out)).not.toContain("#m0");
});

test("the total budget drops the OLDEST hits, never the newest", async () => {
  const pad = "x".repeat(1_000);
  const messages = Array.from({ length: 50 }, (_, i) =>
    msg(
      "user",
      `${pad} #m${i} invoice ${pad}`,
      at("2026-01-01T09:00:00.000Z") + i * 60_000,
    ),
  );
  const id = seed(messages);
  const out = await run({ query: "invoice", limit: 50 }, id);
  const details = detailsOf(out);
  expect(details).toMatchObject({ matched: 50 });
  if (!("outcome" in details) || details.outcome !== "searched")
    throw new Error("expected a search");
  // The cap really bit, and it bit the old end.
  expect(details.returned).toBeGreaterThan(0);
  expect(details.returned).toBeLessThan(50);
  expect(textOf(out)).toContain("#m49");
  expect(textOf(out)).not.toContain("#m0 ");
  expect(textOf(out)).toContain("older matches omitted");
  expect(textOf(out).length).toBeLessThanOrEqual(25_000);
});

test("long messages are ellipsised around the match, not returned whole", async () => {
  const id = seed([
    msg("user", `${"a".repeat(5_000)} passport ${"b".repeat(5_000)}`),
  ]);
  const text = textOf(await run({ query: "passport" }, id));
  expect(text).toContain("[...] ");
  expect(text).toContain(" [...]");
  expect(text.length).toBeLessThan(2_000);
});

test("a message stored before timestamps says so instead of Invalid Date", async () => {
  // Pre-`ts` transcripts really exist on disk; the type cannot express them.
  const legacy = { role: "user", content: "the old dentist" } as ChatMessage;
  const id = seed([legacy]);
  const text = textOf(await run({ query: "dentist" }, id));
  expect(text).toContain("[user - time unknown]");
  expect(text).not.toContain("Invalid Date");
});

test("outside a turn there is no conversation to search", async () => {
  const out = await run({ query: "dentist" });
  expect(detailsOf(out)).toEqual({ outcome: "no_conversation" });
  expect(textOf(out)).toContain("There is no conversation to search");
});

test("an empty query is a correctable error value, not a throw", async () => {
  const id = seed([msg("user", "hello")]);
  const out = await run({ query: "   " }, id);
  // A VALUE with a code: the model can fix its own call from it, which a
  // thrown exception gives it nothing to do.
  expect(detailsOf(out)).toEqual({
    ok: false,
    error: {
      code: "empty_query",
      message: expect.stringContaining("needs something to search for"),
    },
  });
  expect(textOf(out)).toContain("ERROR empty_query");
});

test("still reaches what a /clear put out of the model's context", async () => {
  // `/clear` empties the MODEL's context, never the transcript — so recall is
  // exactly how the assistant answers "what did I tell you about X?" after one.
  const id = seed([
    msg(
      "user",
      "My accountant is Marta Ferreira",
      at("2026-02-01T09:00:00.000Z"),
    ),
    msg("user", "/clear", at("2026-02-02T09:00:00.000Z")),
    {
      role: "assistant",
      content: "",
      ts: at("2026-02-02T09:00:01.000Z"),
      contextCleared: true,
    },
    msg("user", "who is my accountant?", at("2026-02-03T09:00:00.000Z")),
  ]);

  const out = await run({ query: "accountant" }, id);

  expect(textOf(out)).toContain("Marta Ferreira");
});
