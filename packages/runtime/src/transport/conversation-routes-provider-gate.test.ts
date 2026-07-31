import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { beforeEach, expect, test, vi } from "vitest";

const chat = vi.hoisted(() => ({
  ensuredProvider: null as string | null,
  ensureProviderForTurn: vi.fn(async () => chat.ensuredProvider),
  runTurn: vi.fn(async () => {}),
}));
vi.mock("../session/chat", () => ({
  cancelTurn: vi.fn(),
  disposeConversation: vi.fn(),
  ensureProviderForTurn: chat.ensureProviderForTurn,
  runTurn: chat.runTurn,
  setLiveTurnMode: vi.fn(),
}));

const { handleConversationRoute } = await import("./conversation-routes");

function req(body: unknown): IncomingMessage {
  const request = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as IncomingMessage;
  request.headers = {};
  return request;
}

function response(): {
  res: ServerResponse;
  out: { status?: number; body?: unknown };
} {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    writeHead(status: number) {
      out.status = status;
    },
    end(body: Buffer) {
      out.body = JSON.parse(body.toString());
    },
  } as unknown as ServerResponse;
  return { res, out };
}

async function post(body: unknown) {
  const { res, out } = response();
  await handleConversationRoute({
    method: "POST",
    path: "/conversations/test/messages",
    url: new URL("http://runtime.test/conversations/test/messages"),
    req: req(body),
    res,
  });
  return out;
}

beforeEach(() => {
  chat.ensuredProvider = null;
  chat.ensureProviderForTurn.mockClear();
  chat.runTurn.mockClear();
});

test("unpinned no-provider keeps the 409 no_provider contract", async () => {
  const out = await post({ text: "hello" });

  expect(out).toEqual({
    status: 409,
    body: {
      error: "No provider connected. Connect an AI provider first.",
      code: "no_provider",
    },
  });
  expect(chat.runTurn).not.toHaveBeenCalled();
});

test("a pinned turn still enters runTurn for its serve-mode credential gate", async () => {
  const out = await post({ text: "hello", provider: "openai" });

  expect(out.status).toBe(202);
  expect(chat.runTurn).toHaveBeenCalledOnce();
});
