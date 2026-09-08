import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * THE TWO REWINDS AND THE COMMAND GATE.
 *
 * `/truncate` (edit-and-resend) and `/dismiss-interaction` both rewrite what a
 * conversation's later turns read: one cuts the transcript and deletes both
 * backends' native sessions, the other appends a durable stop marker. Each used
 * to guard itself with a private copy of half the gate - the EXECUTING turn and
 * the queued one - which left the window a turn is accepted in but not yet
 * queued (credential sync, session build), and said nothing about a `/clear`
 * already working the conversation. These pin both refusals through the real
 * gate.
 */

const store = vi.hoisted(() => ({
  truncateConversation: vi.fn(() => ({ removed: 2 }) as { removed: number }),
  markConversationStopped: vi.fn(),
}));
vi.mock("../store/conversations", () => ({
  deleteConversation: vi.fn(),
  getHistory: vi.fn(),
  listConversations: vi.fn(() => []),
  markConversationStopped: store.markConversationStopped,
  renameConversation: vi.fn(),
  truncateConversation: store.truncateConversation,
}));

const chat = vi.hoisted(() => ({
  disposeConversation: vi.fn(async () => {}),
}));
vi.mock("../session/chat", () => ({
  cancelTurn: vi.fn(),
  disposeConversation: chat.disposeConversation,
  ensureProviderForTurn: vi.fn(),
  runTurn: vi.fn(),
  setLiveTurnMode: vi.fn(),
}));

const bus = vi.hoisted(() => ({ running: new Set<string>() }));
vi.mock("../session/bus", () => ({
  evict: vi.fn(),
  isTurnRunning: (id: string) => bus.running.has(id),
  publish: vi.fn(),
}));

vi.mock("../session/conversation-cache", () => ({
  conversations: new Map<string, { pending: number }>(),
}));

const {
  beginConversationCommand,
  conversationCommandBusy,
  holdConversationTurn,
} = await import("../session/conversation-command-gate");
const { handleConversationRoute } = await import("./conversation-routes");
const { truncateConversationTurn } = await import("../session/truncate-turn");

function post(path: string, body: unknown) {
  const out: { status?: number; body?: unknown } = {};
  const req = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as IncomingMessage;
  req.headers = {};
  const res = {
    writeHead: (status: number) => {
      out.status = status;
    },
    end: (payload: Buffer) => {
      out.body = JSON.parse(payload.toString());
    },
  } as unknown as ServerResponse;
  return handleConversationRoute({
    method: "POST",
    path,
    url: new URL(`http://runtime.test${path}`),
    req,
    res,
  }).then(() => out);
}

beforeEach(() => {
  bus.running.clear();
  store.truncateConversation.mockClear();
  store.markConversationStopped.mockClear();
  chat.disposeConversation.mockClear();
});

test("a rewind is refused while a command is working the conversation", async () => {
  const settle = beginConversationCommand("c1");
  const out = await post("/conversations/c1/truncate", { turnId: "t1" });
  expect(out.status).toBe(409);
  expect(store.truncateConversation).not.toHaveBeenCalled();
  settle();
});

test("a rewind is refused behind a turn that is accepted but not yet running", async () => {
  // The window a private isTurnRunning check could not see: the route said yes
  // to a turn that is still building its session, and the cut below would
  // delete the very session it is building.
  const turn = Promise.withResolvers<void>();
  holdConversationTurn("c2", turn.promise);
  const out = await post("/conversations/c2/truncate", { turnId: "t1" });
  expect(out.status).toBe(409);
  expect(chat.disposeConversation).not.toHaveBeenCalled();
  turn.resolve();
  await turn.promise;
});

test("a rewind holds the conversation for as long as it runs", async () => {
  const teardown = Promise.withResolvers<void>();
  chat.disposeConversation.mockImplementationOnce(() => teardown.promise);
  const cut = truncateConversationTurn("c3", "t1");
  expect(conversationCommandBusy("c3")).toBe(true);
  teardown.resolve();
  await cut;
  expect(conversationCommandBusy("c3")).toBe(false);
});

test("a rewind releases the conversation even when the cut throws", async () => {
  store.truncateConversation.mockImplementationOnce(() => {
    throw new Error("store is gone");
  });
  await expect(truncateConversationTurn("c4", "t1")).rejects.toThrow(
    "store is gone",
  );
  expect(conversationCommandBusy("c4")).toBe(false);
});

test("dismissing an interaction is refused while a command is working", async () => {
  const settle = beginConversationCommand("c5");
  const out = await post("/conversations/c5/dismiss-interaction", {});
  expect(out.status).toBe(409);
  expect(store.markConversationStopped).not.toHaveBeenCalled();
  settle();
  const after = await post("/conversations/c5/dismiss-interaction", {});
  expect(after.status).toBe(200);
  expect(store.markConversationStopped).toHaveBeenCalledWith("c5");
});

test("an idle conversation still rewinds", async () => {
  const out = await post("/conversations/c6/truncate", { turnId: "t1" });
  expect(out.status).toBe(200);
  expect(out.body).toEqual({ ok: true, removed: 2 });
});
