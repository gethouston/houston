import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

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

const dataDir = mkdtempSync(join(tmpdir(), "conversation-command-route-"));
vi.stubEnv("HOUSTON_DATA_DIR", dataDir);
const { handleConversationRoute } = await import("./conversation-routes");
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

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
    expect.any(String),
  );
  expect(chat.runTurn).not.toHaveBeenCalled();
});

test("a command works with no provider connected", async () => {
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
  chat.ensureProviderForTurn.mockResolvedValueOnce("openai");
  gate.commandRunning = true;

  const out = await post({ text: "what did we decide?", nonce: "n2" });

  expect(chat.runTurn).not.toHaveBeenCalled();
  expect(out.status).toBe(503);
  expect(out.body).toMatchObject({ error: "engine unavailable" });
  expect(out.headers).toMatchObject({ "Retry-After": "1" });
});

test("an accepted turn holds the conversation for its whole life", async () => {
  chat.ensureProviderForTurn.mockResolvedValueOnce("openai");

  const out = await post({ text: "hello" });

  expect(out.status).toBe(202);
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
