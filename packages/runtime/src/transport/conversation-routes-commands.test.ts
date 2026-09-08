import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * The turn route is where every channel's message enters the runtime, so it is
 * where a conversation command has to be caught: one interception serves the
 * desktop composer and every relay that will ever forward plain text.
 */

const chat = vi.hoisted(() => ({
  runTurn: vi.fn(async () => {}),
  ensureProviderForTurn: vi.fn(async () => null as string | null),
}));
vi.mock("../session/chat", () => ({
  cancelTurn: vi.fn(),
  disposeConversation: vi.fn(),
  ensureProviderForTurn: chat.ensureProviderForTurn,
  runTurn: chat.runTurn,
  setLiveTurnMode: vi.fn(),
}));

const commands = vi.hoisted(() => ({
  busy: false,
  runConversationCommand: vi.fn(async () => {}),
}));
vi.mock("../session/conversation-command-run", () => ({
  conversationCommandBusy: () => commands.busy,
  runConversationCommand: commands.runConversationCommand,
}));

const { handleConversationRoute } = await import("./conversation-routes");

function post(body: unknown) {
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
    path: "/conversations/c1/messages",
    url: new URL("http://runtime.test/conversations/c1/messages"),
    req,
    res,
  }).then(() => out);
}

beforeEach(() => {
  commands.busy = false;
  commands.runConversationCommand.mockClear();
  chat.runTurn.mockClear();
  chat.ensureProviderForTurn.mockClear();
});

test("a command runs as a command and never as a prompt", async () => {
  const out = await post({ text: "/compact", nonce: "n1" });

  expect(out.status).toBe(202);
  expect(commands.runConversationCommand).toHaveBeenCalledWith(
    "c1",
    "compact",
    "/compact",
    "n1",
  );
  expect(chat.runTurn).not.toHaveBeenCalled();
});

test("a command works with no provider connected", async () => {
  // `/clear` is how a user recovers a chat, so the provider gate that refuses
  // ordinary turns must not stand between them and it.
  const out = await post({ text: "/clear" });

  expect(out.status).toBe(202);
  expect(chat.ensureProviderForTurn).not.toHaveBeenCalled();
  expect(commands.runConversationCommand).toHaveBeenCalledOnce();
});

test("a command racing a live turn is refused, not queued behind it", async () => {
  commands.busy = true;

  const out = await post({ text: "/clear" });

  expect(out).toEqual({ status: 409, body: { error: "turn running" } });
  expect(commands.runConversationCommand).not.toHaveBeenCalled();
});

test("an unknown slash message is the user talking, and reaches the model", async () => {
  chat.ensureProviderForTurn.mockResolvedValueOnce("openai");

  const out = await post({ text: "/deploy the thing" });

  expect(out.status).toBe(202);
  expect(commands.runConversationCommand).not.toHaveBeenCalled();
  expect(chat.runTurn).toHaveBeenCalledOnce();
});
