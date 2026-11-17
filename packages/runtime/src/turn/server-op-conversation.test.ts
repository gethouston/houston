import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { appendAssistantMessageAt } from "../store/conversation-file";
import { importConversationMessagesAt } from "../store/conversation-import";
import { truncateConversationMutationAt } from "../store/conversation-truncate";
import {
  conversation,
  opWorker,
  RUNTIME,
} from "./server-op-conversation.test-support";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const imported = {
  importId: "onboarding",
  at: "start" as const,
  messages: [
    { role: "user" as const, content: "earlier" },
    { role: "assistant" as const, content: "welcome" },
  ],
};
function podDir(data: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "pod-parity-"));
  dirs.push(dir);
  writeFileSync(join(dir, "c1.json"), JSON.stringify(data));
  return dir;
}

for (const action of ["truncate", "import", "dismiss-interaction"] as const) {
  test(`${action} matches the pod response and stored history under its conversation claim`, async () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    const { pool, post } = await opWorker();
    pool.put(`${RUNTIME}/conversations/c1.json`, JSON.stringify(conversation));
    pool.put(`${RUNTIME}/sessions/c1/state.jsonl`, "stale");
    pool.put(`${RUNTIME}/sessions/c10/state.jsonl`, "other");
    const dir = podDir(conversation);
    const body =
      action === "truncate"
        ? { turnId: "t2" }
        : action === "import"
          ? imported
          : {};
    const expected =
      action === "truncate"
        ? {
            ok: true,
            removed: truncateConversationMutationAt(dir, "c1", "t2")?.removed,
          }
        : action === "import"
          ? {
              ok: true,
              imported: importConversationMessagesAt(dir, "c1", imported),
            }
          : { ok: true };
    if (action === "dismiss-interaction")
      appendAssistantMessageAt(dir, "c1", "", { stopped: true });
    const out = await post({
      kind: "conversation",
      conversationId: "c1",
      action,
      body: JSON.stringify(body),
    });
    expect(out.status, JSON.stringify(out)).toBe(200);
    expect(JSON.parse(out.body ?? "null")).toEqual(expected);
    const stored = JSON.parse(pool.read(`${RUNTIME}/conversations/c1.json`));
    expect(stored).toEqual(
      JSON.parse(readFileSync(join(dir, "c1.json"), "utf8")),
    );
    expect(JSON.parse(pool.transcripts[0]?.body ?? "null")).toEqual(stored);
    expect(
      pool.transcripts[0]?.headers.get("X-Houston-Claim-Conversation"),
    ).toBe("c1");
    const keys = await pool.keys();
    expect(keys.includes(`${RUNTIME}/sessions/c1/state.jsonl`)).toBe(
      action === "dismiss-interaction",
    );
    expect(keys).toContain(`${RUNTIME}/sessions/c10/state.jsonl`);
    expect(pool.writes.every((write) => write.claim === "c1")).toBe(true);
  });
}

test("an archived cut removes all later segments and matches the pod", async () => {
  vi.spyOn(Date, "now").mockReturnValue(100);
  const { pool, post } = await opWorker();
  const archived = {
    ...conversation,
    messages: conversation.messages.slice(2),
    archived: { messages: 2, segments: [2] },
  };
  const segment = {
    id: "c1",
    segment: 1,
    messages: conversation.messages.slice(0, 2),
  };
  pool.put(`${RUNTIME}/conversations/c1.json`, JSON.stringify(archived));
  pool.put(
    `${RUNTIME}/conversations/c1.archive/1.json`,
    JSON.stringify(segment),
  );
  const dir = podDir(archived);
  mkdirSync(join(dir, "c1.archive"));
  writeFileSync(join(dir, "c1.archive/1.json"), JSON.stringify(segment));
  const expected = truncateConversationMutationAt(dir, "c1", "t1");
  const out = await post({
    kind: "conversation",
    conversationId: "c1",
    action: "truncate",
    body: '{"turnId":"t1"}',
  });
  expect(JSON.parse(out.body ?? "null")).toEqual({
    ok: true,
    removed: expected?.removed,
  });
  expect(JSON.parse(pool.read(`${RUNTIME}/conversations/c1.json`))).toEqual(
    JSON.parse(readFileSync(join(dir, "c1.json"), "utf8")),
  );
  expect(await pool.keys()).not.toContain(
    `${RUNTIME}/conversations/c1.archive/1.json`,
  );
});

test("database snapshot wins over the lagging file before an import and retry is idempotent", async () => {
  const { pool, post } = await opWorker();
  pool.put(
    `${RUNTIME}/conversations/c1.json`,
    JSON.stringify({ ...conversation, messages: [] }),
  );
  const op = {
    kind: "conversation",
    action: "import",
    conversationId: "c1",
    body: JSON.stringify(imported),
    transcript: conversation,
  };
  const out = await post(op);
  expect(JSON.parse(out.body ?? "null")).toEqual({ ok: true, imported: 2 });
  const stored = JSON.parse(pool.read(`${RUNTIME}/conversations/c1.json`));
  expect(stored.messages.slice(2)).toEqual(conversation.messages);
  pool.put(`${RUNTIME}/sessions/c1/new.jsonl`, "fresh");
  const retry = await post({ ...op, transcript: stored });
  expect(JSON.parse(retry.body ?? "null")).toEqual({ ok: true, imported: 0 });
  expect(await pool.keys()).toContain(`${RUNTIME}/sessions/c1/new.jsonl`);
});

test("missing dismissal is a successful no-op and invalid imports do not write", async () => {
  const { pool, post } = await opWorker();
  const dismissed = await post({
    kind: "conversation",
    action: "dismiss-interaction",
    conversationId: "c1",
  });
  expect(dismissed.status).toBe(200);
  expect(JSON.parse(dismissed.body ?? "null")).toEqual({ ok: true });
  const invalid = await post({
    kind: "conversation",
    action: "import",
    conversationId: "c1",
    body: '{"messages":[]}',
  });
  expect(invalid.status).toBe(400);
  expect(JSON.parse(invalid.body ?? "null")).toEqual({
    error: "not a conversation import",
    code: "invalid_import",
  });
  expect(pool.writes).toEqual([]);
  expect(pool.transcripts).toEqual([]);
});

test.each([404, 500])(
  "failed transcript projection (%s) after a durable cut is ambiguous",
  async (status) => {
    const { pool, post } = await opWorker(status);
    pool.put(`${RUNTIME}/conversations/c1.json`, JSON.stringify(conversation));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const out = await post({
      kind: "conversation",
      action: "truncate",
      conversationId: "c1",
      body: '{"turnId":"t2"}',
    });
    expect(out).toEqual({ ok: true, ambiguous: true });
    expect(
      JSON.parse(pool.read(`${RUNTIME}/conversations/c1.json`)).messages,
    ).toHaveLength(2);
    expect(error).toHaveBeenCalled();
  },
);

test("an absent database conversation discards a stale file before importing", async () => {
  const { pool, post } = await opWorker();
  pool.put(`${RUNTIME}/conversations/c1.json`, JSON.stringify(conversation));
  pool.put(
    `${RUNTIME}/conversations/c1.archive/1.json`,
    JSON.stringify({ id: "c1", segment: 1, messages: conversation.messages }),
  );
  const out = await post({
    kind: "conversation",
    action: "import",
    conversationId: "c1",
    body: JSON.stringify(imported),
    transcript: null,
  });
  expect(out.status).toBe(200);
  const stored = JSON.parse(pool.read(`${RUNTIME}/conversations/c1.json`));
  expect(
    stored.messages.map((message: { content: string }) => message.content),
  ).toEqual(["earlier", "welcome"]);
  expect(await pool.keys()).not.toContain(
    `${RUNTIME}/conversations/c1.archive/1.json`,
  );
  expect(JSON.parse(pool.transcripts[0]?.body ?? "null")).toEqual(stored);
});
