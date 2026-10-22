import type {
  AssistantMessage,
  AssistantMessageEventStream,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { HarnessTimingEvent } from "../types";
import { SentRequests } from "./model-phase";
import { PiSession } from "./session";

/**
 * `PiSession.forceToolCall` runs beside pi's agent loop, never through it: it
 * extends the request the last prompt sent, fires no session event (so no
 * wire frame), reports its call timing, and dies with the turn's Stop.
 */

const USAGE = {
  input: 1,
  output: 2,
  cacheRead: 3,
  cacheWrite: 0,
  totalTokens: 6,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function answer(over: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "Listo." }],
    api: "openai-codex-responses",
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    usage: USAGE,
    stopReason: "stop",
    timestamp: 0,
    ...over,
  };
}

const ARGS = {
  actions: [
    { id: "a", label: "A", message: "do a" },
    { id: "b", label: "B", message: "do b" },
  ],
};

/** A pi session whose prompt sends one request and appends its reply. */
class Stub {
  listeners = new Set<(e: unknown) => void>();
  messages: AssistantMessage[] = [];
  active = ["read", "suggest_actions"];
  forcedSignal: AbortSignal | undefined;
  hang = false;
  agent = {
    streamFunction: (_m: unknown, _c: unknown, _o: unknown) => "stream",
  };
  modelRuntime = {
    streamSimple: (
      _model: unknown,
      _context: unknown,
      options: SimpleStreamOptions,
    ) => {
      this.forcedSignal = options.signal;
      const hang = this.hang;
      const signal = options.signal;
      const called = answer({
        content: [
          {
            type: "toolCall",
            id: "c",
            name: "suggest_actions",
            arguments: ARGS,
          },
        ],
        stopReason: "toolUse",
      });
      const stream = {
        async *[Symbol.asyncIterator]() {
          if (hang)
            await new Promise((resolve) =>
              signal?.addEventListener("abort", resolve),
            );
          yield { type: "start", partial: called };
        },
        result: async () =>
          signal?.aborted ? answer({ stopReason: "aborted" }) : called,
      };
      return stream as unknown as AssistantMessageEventStream;
    },
  };
  subscribe(l: (e: unknown) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  getActiveToolNames() {
    return this.active;
  }
  provider = "openai-codex";
  api = "openai-codex-responses";
  sessionId = "s";
  async prompt() {
    this.agent.streamFunction(
      { api: this.api, provider: this.provider },
      { messages: [] },
      { sessionId: "s" },
    );
    this.messages.push(answer());
  }
  async abort() {}
}

function make() {
  const stub = new Stub();
  const session = new PiSession(
    stub as unknown as AgentSession,
    new SentRequests(),
  );
  const wire: WireEvent[] = [];
  const calls: HarnessTimingEvent[] = [];
  session.subscribe((e) => wire.push(e));
  session.subscribeModelCalls((e) => calls.push(e));
  return { stub, session, wire, calls };
}

const request = () => ({
  toolName: "suggest_actions",
  instruction: "call it",
  signal: new AbortController().signal,
});

test("returns the call's arguments, reports its timing, and emits no wire frame", async () => {
  const { session, wire, calls } = make();
  await session.prompt("hi");
  expect(await session.forceToolCall(request())).toEqual({
    outcome: "called",
    args: ARGS,
  });
  expect(wire).toEqual([]);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    type: "call",
    call: { cacheReadTokens: 3 },
  });
});

test("is unavailable when the tool is not offered or nothing was sent this prompt", async () => {
  const { stub, session } = make();
  await session.prompt("hi");
  stub.active = ["read"];
  expect(await session.forceToolCall(request())).toEqual({
    outcome: "unavailable",
    reason: "tool not offered",
  });
  stub.active = ["suggest_actions"];
  stub.prompt = async () => undefined;
  await session.prompt("again");
  expect(await session.forceToolCall(request())).toEqual({
    outcome: "unavailable",
    reason: "no finished reply",
  });
});

test("a model that cannot be forced sends no request at all", async () => {
  const { stub, session, calls } = make();
  let sentForced = false;
  stub.modelRuntime.streamSimple = () => {
    sentForced = true;
    throw new Error("no request expected");
  };
  stub.provider = "openai-compatible";
  stub.api = "openai-completions";
  await session.prompt("local");
  expect(await session.forceToolCall(request())).toEqual({
    outcome: "unsupported",
    reason: "openai-compatible over openai-completions",
  });
  expect(sentForced).toBe(false);
  expect(calls).toEqual([]);
});

test("the turn's Stop aborts an in-flight forced call", async () => {
  const { stub, session } = make();
  await session.prompt("hi");
  stub.hang = true;
  const pending = session.forceToolCall(request());
  await new Promise((resolve) => setTimeout(resolve, 0));
  await session.abort();
  expect(stub.forcedSignal?.aborted).toBe(true);
  await expect(pending).rejects.toThrow("request aborted");
});
