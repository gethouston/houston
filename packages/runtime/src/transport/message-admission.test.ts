import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  directory: "",
  provider: "openai" as string | null,
  running: Promise.resolve(),
  completed: false,
  commandBusy: false,
  draining: false,
  runTurn: vi.fn(async (..._args: unknown[]) => state.running),
  runCommand: vi.fn(async (..._args: unknown[]) => state.running),
}));
vi.mock("../config", () => ({
  config: {
    get dataDir() {
      return state.directory;
    },
  },
}));
vi.mock("../session/chat", () => ({
  ensureProviderForTurn: async () => state.provider,
  runTurn: state.runTurn,
}));
vi.mock("../session/conversation-command-run", () => ({
  runConversationCommand: state.runCommand,
}));
vi.mock("../session/conversation-command-gate", () => ({
  conversationCommandBusy: () => state.commandBusy,
  conversationCommandInFlight: () => state.commandBusy,
  holdConversationTurn: (_id: string, work: Promise<void>) => {
    void work;
  },
}));
vi.mock("../session/drain", () => ({ isDraining: () => state.draining }));
vi.mock("../store/conversations", () => ({
  getHistory: () => ({
    messages: state.completed
      ? [
          {
            role: "assistant",
            turnId:
              state.runTurn.mock.calls[0]?.[8] ??
              state.runCommand.mock.calls[0]?.[4],
          },
        ]
      : [],
  }),
}));

beforeEach(() => {
  state.directory = mkdtempSync(join(tmpdir(), "message-admission-route-"));
  state.provider = "openai";
  state.completed = false;
  state.commandBusy = false;
  state.draining = false;
  state.running = new Promise<void>(() => {});
  state.runTurn.mockClear();
  state.runCommand.mockClear();
  vi.resetModules();
});
afterEach(() => {
  rmSync(state.directory, { recursive: true, force: true });
});

async function post(body: Record<string, unknown>, actor?: string) {
  const { handleStartTurn } = await import("./conversation-start-turn");
  const request = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as IncomingMessage;
  request.headers = actor ? { "x-houston-acting-user": actor } : {};
  const out: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    writeHead: (status: number) => {
      out.status = status;
    },
    end: (value: Buffer) => {
      out.body = JSON.parse(value.toString()) as Record<string, unknown>;
    },
  } as unknown as ServerResponse;
  await handleStartTurn(
    {
      req: request,
      res,
      method: "POST",
      path: "/conversations/assistant/messages",
      url: new URL("http://runtime.test/conversations/assistant/messages"),
    },
    "assistant",
  );
  return out;
}

test("concurrent identical requests start one turn and return the same acceptance", async () => {
  const results = await Promise.all([
    post({ text: "hello", nonce: "n" }),
    post({ text: "hello", nonce: "n" }),
  ]);
  expect(results.map((r) => r.status)).toEqual([202, 202]);
  expect(state.runTurn).toHaveBeenCalledOnce();
  expect(results[0]?.body?.turnId).toBe(results[1]?.body?.turnId);
  expect(results.filter((r) => r.body?.duplicate)).toHaveLength(1);
});

test.each([
  { text: "different", nonce: "n" },
  { text: "hello", nonce: "n", mode: "auto" },
])("changed accepted payload is rejected: %j", async (body) => {
  await post({ text: "hello", nonce: "n" });
  expect(await post(body)).toMatchObject({
    status: 409,
    body: { code: "nonce_conflict" },
  });
  expect(state.runTurn).toHaveBeenCalledOnce();
});

test("a different acting user cannot adopt an accepted nonce", async () => {
  await post({ text: "hello", nonce: "n" }, "user-a");
  expect(await post({ text: "hello", nonce: "n" }, "user-b")).toMatchObject({
    status: 409,
    body: { code: "nonce_conflict" },
  });
});

test("a refusal before admission leaves the nonce reusable", async () => {
  state.provider = null;
  expect(await post({ text: "hello", nonce: "n" })).toMatchObject({
    status: 409,
    body: { code: "no_provider" },
  });
  state.provider = "openai";
  expect(await post({ text: "hello", nonce: "n" })).toMatchObject({
    status: 202,
  });
  expect(state.runTurn).toHaveBeenCalledOnce();
});

test("a completed turn is accepted after module restart without another execution", async () => {
  const first = await post({ text: "hello", nonce: "n" });
  state.completed = true;
  vi.resetModules();
  expect(await post({ text: "hello", nonce: "n" })).toMatchObject({
    status: 202,
    body: { duplicate: true, turnId: first.body?.turnId },
  });
  expect(state.runTurn).toHaveBeenCalledOnce();
});

test("a restart after acceptance with no terminal proof refuses automatic execution", async () => {
  const first = await post({ text: "hello", nonce: "n" });
  vi.resetModules();
  expect(await post({ text: "hello", nonce: "n" })).toMatchObject({
    status: 409,
    body: { code: "turn_interrupted", turnId: first.body?.turnId },
  });
  expect(state.runTurn).toHaveBeenCalledOnce();
});

test("ordinary no-nonce sends preserve their response and execution behavior", async () => {
  expect(await post({ text: "hello" })).toEqual({
    status: 202,
    body: { ok: true, id: "assistant" },
  });
  expect(await post({ text: "hello" })).toEqual({
    status: 202,
    body: { ok: true, id: "assistant" },
  });
  expect(state.runTurn).toHaveBeenCalledTimes(2);
});

test("conversation commands share durable nonce admission", async () => {
  const first = await post({ text: "/clear", nonce: "n" });
  expect(await post({ text: "/clear", nonce: "n" })).toMatchObject({
    status: 202,
    body: { duplicate: true, turnId: first.body?.turnId },
  });
  expect(state.runCommand).toHaveBeenCalledOnce();
  expect(state.runTurn).not.toHaveBeenCalled();
});

test("a caller-controlled host fingerprint never overrides the actual request content", async () => {
  const metadata = { nonce: "n", hostMessageFingerprint: "a".repeat(64) };
  expect(await post({ text: "original", ...metadata })).toMatchObject({
    status: 202,
  });
  expect(await post({ text: "different", ...metadata })).toMatchObject({
    status: 409,
    body: { code: "nonce_conflict" },
  });
  expect(state.runTurn).toHaveBeenCalledOnce();
});
