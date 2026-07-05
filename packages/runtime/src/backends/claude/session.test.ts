import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import type { ResolvedModel } from "../types";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";

/**
 * ClaudeSession is the Claude Agent SDK implementation of the HarnessSession
 * seam. These tests pin the same contract `backend-contract.test.ts` requires —
 * ordered delivery, unsubscribe, prompt-resolves-after-terminal, abort-before-
 * prompt safe, dispose idempotent, no double terminal on abort — plus the
 * backend's own guarantees: a provider failure rides the stream (never a throw),
 * model/thinking apply to the next query, resume is passed, session_id persists.
 * Driven entirely by a scripted `query` generator — no binary, no network.
 */

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const tick = () => new Promise((r) => setImmediate(r));

function fakeStore(
  resume?: string,
): SessionsStore & { setCalls: Array<[string, string]> } {
  const setCalls: Array<[string, string]> = [];
  return {
    setCalls,
    getSessionId: () => undefined,
    setSessionId: (c, s) => {
      setCalls.push([c, s]);
    },
    remove: () => {},
    purge: () => {},
    resolveResume: () => resume,
  };
}

function arrayQuery(msgs: SDKMessage[]): ClaudeQuery {
  return async function* () {
    for (const m of msgs) {
      await Promise.resolve();
      yield m;
    }
  };
}

/** An async iterable that yields nothing (a turn that produced no messages). */
function emptyIterable(): AsyncIterable<SDKMessage> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ done: true, value: undefined }),
    }),
  };
}

/** A query that records the options it was called with, then yields nothing. */
function capturingQuery(onOptions: (o: Options) => void): ClaudeQuery {
  return (params) => {
    onOptions(params.options);
    return emptyIterable();
  };
}

/** A query whose iterator rejects (an unexpected transport failure). */
function throwingQuery(err: unknown): ClaudeQuery {
  return () => ({
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        throw err;
      },
    }),
  });
}

function textMsg(text: string, sessionId = "s"): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    session_id: sessionId,
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
}
function usageMsg(sessionId = "s"): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 },
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function make(deps: {
  query: ClaudeQuery;
  store?: SessionsStore;
  model?: string;
}): ClaudeSession {
  return new ClaudeSession({
    query: deps.query,
    conversationId: "c1",
    baseOptions: {} as Options,
    sessionsStore: deps.store ?? fakeStore(),
    model: deps.model ?? "claude-sonnet-4-6",
  });
}

test("events are delivered to the subscriber in order", async () => {
  const session = make({
    query: arrayQuery([textMsg("one "), textMsg("two"), usageMsg()]),
  });
  const seen: WireEvent[] = [];
  session.subscribe((e) => seen.push(e));

  await session.prompt("go");

  expect(seen).toEqual([
    { type: "text", data: "one " },
    { type: "text", data: "two" },
    {
      type: "usage",
      data: { context_tokens: 100, output_tokens: 20, cached_tokens: 0 },
    },
  ]);
});

test("unsubscribe stops delivery", async () => {
  const session = make({ query: arrayQuery([textMsg("a")]) });
  const seen: WireEvent[] = [];
  const unsub = session.subscribe((e) => seen.push(e));
  unsub();

  await session.prompt("go");
  expect(seen).toEqual([]);
});

test("prompt resolves only after the whole script has been delivered", async () => {
  const session = make({ query: arrayQuery([textMsg("hi"), usageMsg()]) });
  const seen: WireEvent[] = [];
  session.subscribe((e) => seen.push(e));

  await session.prompt("go");
  // The terminal (usage) frame is the last thing delivered before settlement.
  expect(seen.at(-1)).toEqual({
    type: "usage",
    data: { context_tokens: 100, output_tokens: 20, cached_tokens: 0 },
  });
});

test("abort before any prompt is safe (no throw)", async () => {
  const session = make({ query: arrayQuery([]) });
  await expect(session.abort()).resolves.toBeUndefined();
});

test("dispose is idempotent", async () => {
  const session = make({ query: arrayQuery([]) });
  expect(() => {
    session.dispose();
    session.dispose();
  }).not.toThrow();
});

test("prompt never throws on a provider failure — it emits a provider_error", async () => {
  const errored = {
    type: "assistant",
    error: "authentication_failed",
    message: { role: "assistant", model: "claude-sonnet-4-6", content: [] },
    parent_tool_use_id: null,
    session_id: "s",
  } as unknown as SDKMessage;
  const session = make({ query: arrayQuery([errored]) });
  const seen: WireEvent[] = [];
  session.subscribe((e) => seen.push(e));

  await expect(session.prompt("go")).resolves.toBeUndefined();
  expect(seen).toEqual([
    {
      type: "provider_error",
      data: {
        kind: "unauthenticated",
        provider: "anthropic",
        cause: "unknown",
        message: "Claude error: authentication_failed",
      },
    },
  ]);
});

test("an unexpected iterator throw becomes a typed provider_error, not a rethrow", async () => {
  const session = make({ query: throwingQuery(new Error("socket hang up")) });
  const seen: WireEvent[] = [];
  session.subscribe((e) => seen.push(e));

  await expect(session.prompt("go")).resolves.toBeUndefined();
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({
    type: "provider_error",
    data: { kind: "network_unreachable", provider: "anthropic" },
  });
});

test("abort mid-stream: the post-abort throw is swallowed, no second terminal", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const query: ClaudeQuery = async function* (params) {
    yield textMsg("hi");
    await gate;
    if (params.options.abortController?.signal.aborted)
      throw new Error("aborted by user");
  };
  const session = make({ query });
  const seen: WireEvent[] = [];
  session.subscribe((e) => seen.push(e));

  const p = session.prompt("go");
  await tick();
  await session.abort();
  release();
  await expect(p).resolves.toBeUndefined();

  // Only the pre-abort frame; NO provider_error / second terminal for the stop.
  expect(seen).toEqual([{ type: "text", data: "hi" }]);
});

test("setModel + setThinkingLevel apply to the NEXT query's options", async () => {
  let captured: Options | undefined;
  const session = make({
    query: capturingQuery((o) => {
      captured = o;
    }),
  });
  const model: ResolvedModel = {
    provider: "anthropic",
    id: "claude-opus-4-5",
    contextWindow: 200_000,
  };
  await session.setModel(model);
  session.setThinkingLevel("high");

  await session.prompt("go");

  expect(captured?.model).toBe("claude-opus-4-5");
  expect(captured?.thinking).toEqual({ type: "enabled" });
  expect(captured?.effort).toBe("high");
});

test("a stored resume id is passed to the query", async () => {
  let captured: Options | undefined;
  const session = make({
    query: capturingQuery((o) => {
      captured = o;
    }),
    store: fakeStore("sess-resume"),
  });
  await session.prompt("go");
  expect(captured?.resume).toBe("sess-resume");
});

test("no resume id → the option is omitted (fresh session)", async () => {
  let captured: Options | undefined;
  const session = make({
    query: capturingQuery((o) => {
      captured = o;
    }),
    store: fakeStore(undefined),
  });
  await session.prompt("go");
  expect(captured && "resume" in captured).toBe(false);
});

test("the captured session_id is persisted after the turn", async () => {
  const store = fakeStore();
  const session = make({
    query: arrayQuery([textMsg("hi", "sess-99"), usageMsg("sess-99")]),
    store,
  });
  await session.prompt("go");
  expect(store.setCalls).toContainEqual(["c1", "sess-99"]);
});

test("getContextUsage is undefined before a turn, then reflects the last usage", async () => {
  const session = make({ query: arrayQuery([usageMsg()]) });
  expect(session.getContextUsage()).toBeUndefined();
  await session.prompt("go");
  expect(session.getContextUsage()).toEqual({ tokens: 100 });
});
