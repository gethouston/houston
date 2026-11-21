import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({
  importConversationMessages: vi.fn(() => 2),
}));
vi.mock("../store/conversations", () => ({
  deleteConversation: vi.fn(),
  getHistory: vi.fn(),
  importConversationMessages: store.importConversationMessages,
  listConversations: vi.fn(() => []),
  markConversationStopped: vi.fn(),
  renameConversation: vi.fn(),
  truncateConversation: vi.fn(),
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

const bus = vi.hoisted(() => ({ evict: vi.fn() }));
vi.mock("../session/bus", () => ({
  evict: bus.evict,
  publish: vi.fn(),
}));

vi.mock("../session/conversation-cache", () => ({
  conversations: new Map<string, { pending: number }>(),
}));

const { beginConversationCommand } = await import(
  "../session/conversation-command-gate"
);
const { handleConversationRoute } = await import("./conversation-routes");

function post(path: string, raw: string) {
  const out: { status?: number; body?: unknown } = {};
  const req = Readable.from([Buffer.from(raw)]) as IncomingMessage;
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

const request = {
  importId: "onboarding:first_run",
  messages: [
    { role: "assistant", content: "Hi Ana!" },
    { role: "user", content: "Retail" },
  ],
};

beforeEach(() => {
  store.importConversationMessages.mockClear();
  chat.disposeConversation.mockClear();
  bus.evict.mockClear();
});

test("an import writes its lines and resets the model's session", async () => {
  const out = await post(
    "/conversations/assistant/import",
    JSON.stringify(request),
  );
  expect(out).toEqual({ status: 200, body: { ok: true, imported: 2 } });
  expect(store.importConversationMessages).toHaveBeenCalledWith(
    "assistant",
    request,
  );
  expect(chat.disposeConversation).toHaveBeenCalledWith("assistant", {
    deleteSessions: true,
  });
  expect(bus.evict).toHaveBeenCalledWith("assistant");
});

test("an import that already landed leaves the session alone", async () => {
  store.importConversationMessages.mockReturnValueOnce(0);
  const out = await post(
    "/conversations/assistant/import",
    JSON.stringify(request),
  );
  expect(out).toEqual({ status: 200, body: { ok: true, imported: 0 } });
  expect(chat.disposeConversation).not.toHaveBeenCalled();
  expect(bus.evict).not.toHaveBeenCalled();
});

test.each([
  ["a body that is not an import", JSON.stringify({ messages: [] })],
  ["a body that is not JSON", "{nope"],
])("refuses %s before writing anything", async (_label, raw) => {
  const out = await post("/conversations/assistant/import", raw);
  expect(out).toEqual({
    status: 400,
    body: { error: "not a conversation import", code: "invalid_import" },
  });
  expect(store.importConversationMessages).not.toHaveBeenCalled();
});

test("refuses while a command is working the conversation", async () => {
  const settle = beginConversationCommand("assistant");
  const out = await post(
    "/conversations/assistant/import",
    JSON.stringify(request),
  );
  expect(out.status).toBe(409);
  expect(store.importConversationMessages).not.toHaveBeenCalled();
  settle();
});
