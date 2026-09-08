import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * The turn route is where every channel's message enters the runtime, so it is
 * where a conversation command has to be caught: one interception serves the
 * desktop composer and every relay that will ever forward plain text.
 *
 * It is also where the two are held apart. A command rewrites the context a
 * turn runs in, so the route may never accept both onto one conversation —
 * these tests pin BOTH refusals, and that neither one loses the message.
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

const gate = vi.hoisted(() => ({
  busy: false,
  commandRunning: false,
  holdConversationTurn: vi.fn(),
}));
vi.mock("../session/conversation-command-gate", () => ({
  conversationCommandBusy: () => gate.busy,
  conversationCommandInFlight: () => gate.commandRunning,
  holdConversationTurn: gate.holdConversationTurn,
}));

const commands = vi.hoisted(() => ({
  runConversationCommand: vi.fn(async () => {}),
}));
vi.mock("../session/conversation-command-run", () => ({
  runConversationCommand: commands.runConversationCommand,
}));

const { handleConversationRoute } = await import("./conversation-routes");

function post(body: unknown) {
  const out: { status?: number; body?: unknown; headers?: unknown } = {};
  const req = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as IncomingMessage;
  req.headers = {};
  const res = {
    writeHead: (status: number, headers?: unknown) => {
      out.status = status;
      out.headers = headers;
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
  gate.busy = false;
  gate.commandRunning = false;
  gate.holdConversationTurn.mockClear();
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
  gate.busy = true;

  const out = await post({ text: "/clear" });

  expect(out).toMatchObject({ status: 409, body: { error: "turn running" } });
  expect(commands.runConversationCommand).not.toHaveBeenCalled();
});

test("a turn racing a running command waits instead of running against a context being reset", async () => {
  // The bug this pins: the turn used to be ACCEPTED here. `/clear` then
  // disposed the session under it mid-flight and wrote its boundary marker
  // above the user's message, so the message ran nowhere and was excluded from
  // every later context — silently.
  chat.ensureProviderForTurn.mockResolvedValueOnce("openai");
  gate.commandRunning = true;

  const out = await post({ text: "what did we decide?", nonce: "n2" });

  expect(chat.runTurn).not.toHaveBeenCalled();
  // The engine's "not here, not now" shape: every shipped client re-sends the
  // SAME message (same nonce) on its wake ladder and shows the user nothing,
  // so the message is delayed by the command, never lost to it.
  expect(out.status).toBe(503);
  expect(out.body).toMatchObject({ error: "engine unavailable" });
  expect(out.headers).toMatchObject({ "Retry-After": "1" });
});

test("an accepted turn holds the conversation for its whole life", async () => {
  chat.ensureProviderForTurn.mockResolvedValueOnce("openai");

  const out = await post({ text: "hello" });

  expect(out.status).toBe(202);
  // The hold is what refuses a `/clear` arriving while this turn runs — the
  // turn's own queue entry comes too late to decide acceptance.
  expect(gate.holdConversationTurn).toHaveBeenCalledWith(
    "c1",
    expect.any(Promise),
  );
});

test("an unknown slash message is the user talking, and reaches the model", async () => {
  chat.ensureProviderForTurn.mockResolvedValueOnce("openai");

  const out = await post({ text: "/deploy the thing" });

  expect(out.status).toBe(202);
  expect(commands.runConversationCommand).not.toHaveBeenCalled();
  expect(chat.runTurn).toHaveBeenCalledOnce();
});
