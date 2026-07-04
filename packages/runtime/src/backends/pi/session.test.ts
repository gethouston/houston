import type {
  AssistantMessage,
  Usage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { ResolvedModel, ThinkingLevel } from "../types";
import { PiSession } from "./session";

/**
 * PiSession is the pi implementation of the HarnessSession seam. These tests pin
 * two things: (1) it runs pi's `AgentSessionEvent` stream through `toWire` and
 * forwards ONLY the non-null WireEvents (the same mapping wire.test.ts fixtures
 * exercise, now proven end-to-end through the wrapper's subscribe), and (2) every
 * other method forwards to the underlying pi session, with dispose idempotent.
 */

/** A valid pi `Usage` for fixtures; `cost` is required by the type. */
function usage(partial: Partial<Usage>): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    ...partial,
  };
}

/** A minimal valid assistant message carrying the given usage. */
function assistantMessage(u: Usage, over: Partial<AssistantMessage> = {}) {
  return {
    role: "assistant",
    content: [],
    api: "anthropic",
    provider: "anthropic",
    model: "test",
    usage: u,
    stopReason: "stop",
    timestamp: 0,
    ...over,
  } as AssistantMessage;
}

const userMessage: UserMessage = { role: "user", content: "", timestamp: 0 };

function textDelta(delta: string): AgentSessionEvent {
  return {
    type: "message_update",
    message: assistantMessage(usage({})),
    assistantMessageEvent: { type: "text_delta", delta },
  } as unknown as AgentSessionEvent;
}

function thinkingDelta(delta: string): AgentSessionEvent {
  return {
    type: "message_update",
    message: assistantMessage(usage({})),
    assistantMessageEvent: { type: "thinking_delta", delta },
  } as unknown as AgentSessionEvent;
}

function toolStart(name: string, args: unknown): AgentSessionEvent {
  return {
    type: "tool_execution_start",
    toolCallId: "t1",
    toolName: name,
    args,
  } as unknown as AgentSessionEvent;
}

function toolEnd(name: string, isError: boolean): AgentSessionEvent {
  return {
    type: "tool_execution_end",
    toolCallId: "t1",
    toolName: name,
    result: null,
    isError,
  } as unknown as AgentSessionEvent;
}

function turnEnd(message: AssistantMessage | UserMessage): AgentSessionEvent {
  return { type: "turn_end", message, toolResults: [] } as AgentSessionEvent;
}

/** A stub pi AgentSession: captures listeners, lets the test emit events, and
 *  records every forwarded method call. Only the surface PiSession touches. */
class StubAgentSession {
  private listeners = new Set<(e: AgentSessionEvent) => void>();
  calls: string[] = [];
  disposeCount = 0;
  lastModel: unknown;
  lastThinking: ThinkingLevel | undefined;
  contextUsage: { tokens: number | null } | undefined;

  subscribe(l: (e: AgentSessionEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(e: AgentSessionEvent) {
    for (const l of this.listeners) l(e);
  }
  async prompt(text: string) {
    this.calls.push(`prompt:${text}`);
  }
  async abort() {
    this.calls.push("abort");
  }
  dispose() {
    this.disposeCount++;
  }
  async setModel(m: unknown) {
    this.calls.push("setModel");
    this.lastModel = m;
  }
  async compact() {
    this.calls.push("compact");
  }
  setThinkingLevel(l: ThinkingLevel) {
    this.lastThinking = l;
  }
  getContextUsage() {
    return this.contextUsage;
  }
}

function make(): { stub: StubAgentSession; session: PiSession } {
  const stub = new StubAgentSession();
  return { stub, session: new PiSession(stub as unknown as AgentSession) };
}

test("subscribe maps text/thinking/tool events to the exact WireEvents", () => {
  const { stub, session } = make();
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));

  stub.emit(textDelta("hello "));
  stub.emit(thinkingDelta("hmm"));
  stub.emit(toolStart("read", { path: "a.txt" }));
  stub.emit(toolEnd("read", true));

  expect(events).toEqual([
    { type: "text", data: "hello " },
    { type: "thinking", data: "hmm" },
    { type: "tool_start", data: { name: "read", args: { path: "a.txt" } } },
    { type: "tool_end", data: { name: "read", isError: true } },
  ]);
});

test("subscribe maps a turn_end with usage to a usage frame", () => {
  const { stub, session } = make();
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));

  stub.emit(
    turnEnd(
      assistantMessage(
        usage({
          input: 100,
          output: 20,
          cacheRead: 300,
          cacheWrite: 50,
          totalTokens: 470,
        }),
      ),
    ),
  );

  expect(events).toEqual([
    {
      type: "usage",
      data: { context_tokens: 450, output_tokens: 20, cached_tokens: 300 },
    },
  ]);
});

test("subscribe surfaces an errored turn_end as a typed provider_error", () => {
  const { stub, session } = make();
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));

  stub.emit(
    turnEnd(
      assistantMessage(usage({}), {
        provider: "github-copilot",
        model: "claude-opus-4.8",
        stopReason: "error",
        errorMessage: "401 Unauthorized: Copilot token expired",
      }),
    ),
  );

  expect(events).toEqual([
    {
      type: "provider_error",
      data: {
        kind: "unauthenticated",
        provider: "github-copilot",
        cause: "token_expired",
        message: "401 Unauthorized: Copilot token expired",
      },
    },
  ]);
});

test("subscribe drops events toWire maps to null (e.g. a usage-less turn_end)", () => {
  const { stub, session } = make();
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));

  stub.emit(turnEnd(userMessage));
  stub.emit({ type: "agent_start" } as AgentSessionEvent);

  expect(events).toEqual([]);
});

test("unsubscribe stops further delivery", () => {
  const { stub, session } = make();
  const events: WireEvent[] = [];
  const unsub = session.subscribe((e) => events.push(e));

  stub.emit(textDelta("a"));
  unsub();
  stub.emit(textDelta("b"));

  expect(events).toEqual([{ type: "text", data: "a" }]);
});

test("prompt / abort / compact / setThinkingLevel / getContextUsage forward", async () => {
  const { stub, session } = make();
  stub.contextUsage = { tokens: 42 };

  await session.prompt("go");
  await session.abort();
  await session.compact();
  session.setThinkingLevel("high");

  expect(stub.calls).toEqual(["prompt:go", "abort", "compact"]);
  expect(stub.lastThinking).toBe("high");
  expect(session.getContextUsage()).toEqual({ tokens: 42 });
});

test("setModel forwards the model straight through to pi", async () => {
  const { stub, session } = make();
  const model: ResolvedModel = {
    provider: "anthropic",
    id: "claude-opus-4-5",
    contextWindow: 200_000,
    reasoning: true,
  };

  await session.setModel(model);

  expect(stub.calls).toEqual(["setModel"]);
  expect(stub.lastModel).toBe(model);
});

test("dispose is idempotent: the underlying session is torn down once", () => {
  const { stub, session } = make();

  session.dispose();
  session.dispose();

  expect(stub.disposeCount).toBe(1);
});
