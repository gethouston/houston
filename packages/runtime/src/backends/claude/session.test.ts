import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import type { ResolvedModel } from "../types";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";

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
    resolveResume: () =>
      resume === undefined
        ? undefined
        : { sessionId: resume, clearedTokens: 0 },
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

function emptyIterable(): AsyncIterable<SDKMessage> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ done: true, value: undefined }),
    }),
  };
}

function capturingQuery(onOptions: (o: Options) => void): ClaudeQuery {
  return (params) => {
    onOptions(params.options);
    return emptyIterable();
  };
}

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
  refreshAuth?: () => { env: Record<string, string>; accessDigest?: string };
  freshRetryPromptPrefix?: () => string;
  baseOptions?: Options;
}): ClaudeSession {
  return new ClaudeSession({
    query: deps.query,
    conversationId: "c1",
    baseOptions: deps.baseOptions ?? ({} as Options),
    sessionsStore: deps.store ?? fakeStore(),
    model: deps.model ?? "claude-sonnet-4-6",
    refreshAuth: deps.refreshAuth ?? (() => ({ env: {} })),
    freshRetryPromptPrefix: deps.freshRetryPromptPrefix,
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

test("a resume the SDK rejects as unknown retries fresh: mapping dropped, no phantom error (HOU-892)", async () => {
  const store = fakeStore("sess-gone");
  const removed: string[] = [];
  store.remove = (c) => {
    removed.push(c);
  };
  const optionsSeen: Options[] = [];
  let call = 0;
  const query: ClaudeQuery = (params) => {
    optionsSeen.push(params.options);
    call++;
    if (call === 1)
      return throwingQuery(
        new Error("No conversation found with session ID: sess-gone"),
      )(params);
    return arrayQuery([textMsg("recovered", "sess-new"), usageMsg("sess-new")])(
      params,
    );
  };
  const session = make({ query, store });
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));
  await session.prompt("go");

  expect(removed).toEqual(["c1"]);
  expect(optionsSeen[0]?.resume).toBe("sess-gone");
  expect(optionsSeen[1] && "resume" in optionsSeen[1]).toBe(false);
  expect(events.some((e) => e.type === "provider_error")).toBe(false);
  expect(events.some((e) => e.type === "text")).toBe(true);
  expect(store.setCalls).toContainEqual(["c1", "sess-new"]);
});

test("a dangling-resume retry prefixes the fresh prompt with canonical history", async () => {
  const prompts: string[] = [];
  let call = 0;
  const query: ClaudeQuery = (params) => {
    prompts.push(params.prompt);
    call++;
    if (call === 1)
      return throwingQuery(
        new Error("No conversation found with session ID: sess-gone"),
      )(params);
    return arrayQuery([usageMsg("sess-new")])(params);
  };
  const session = make({
    query,
    store: fakeStore("sess-gone"),
    freshRetryPromptPrefix: () => "[canonical replay]\n",
  });

  await session.prompt("current prompt");

  expect(prompts).toEqual([
    "current prompt",
    "[canonical replay]\ncurrent prompt",
  ]);
});

test("the same SDK error WITHOUT a resume surfaces normally (no retry loop)", async () => {
  const session = make({
    query: throwingQuery(
      new Error("No conversation found with session ID: whatever"),
    ),
    store: fakeStore(undefined),
  });
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));
  await session.prompt("go");
  expect(events.some((e) => e.type === "provider_error")).toBe(true);
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

test("every prompt spawns with the env refreshAuth returns AT THAT PROMPT — a rotated token is adopted, never the build-time env (PRODUCT-1355)", async () => {
  let current = { token: "sk-ant-oat01-first", digest: "digest-first" };
  const optionsSeen: Options[] = [];
  const session = make({
    query: capturingQuery((o) => {
      optionsSeen.push(o);
    }),
    refreshAuth: () => ({
      env: { CLAUDE_CODE_OAUTH_TOKEN: current.token },
      accessDigest: current.digest,
    }),
  });

  await session.prompt("one");
  current = { token: "sk-ant-oat01-rotated", digest: "digest-rotated" };
  await session.prompt("two");

  expect(optionsSeen[0]?.env?.CLAUDE_CODE_OAUTH_TOKEN).toBe(
    "sk-ant-oat01-first",
  );
  expect(optionsSeen[1]?.env?.CLAUDE_CODE_OAUTH_TOKEN).toBe(
    "sk-ant-oat01-rotated",
  );
  expect(session.getUsedAccessDigest()).toBe("digest-rotated");
});

test("the retry-fresh rerun runs on its own credential read, and the digest names it", async () => {
  const store = fakeStore("sess-gone");
  let reads = 0;
  const optionsSeen: Options[] = [];
  let call = 0;
  const query: ClaudeQuery = (params) => {
    optionsSeen.push(params.options);
    call++;
    if (call === 1)
      return throwingQuery(
        new Error("No conversation found with session ID: sess-gone"),
      )(params);
    return arrayQuery([usageMsg("sess-new")])(params);
  };
  const session = make({
    query,
    store,
    refreshAuth: () => {
      reads++;
      return {
        env: { CLAUDE_CODE_OAUTH_TOKEN: `tok-${reads}` },
        accessDigest: `d-${reads}`,
      };
    },
  });
  await session.prompt("go");
  expect(
    optionsSeen.map((options) => options.env?.CLAUDE_CODE_OAUTH_TOKEN),
  ).toEqual(["tok-1", "tok-2"]);
  expect(session.getUsedAccessDigest()).toBe("d-2");
});

test("getContextUsage is undefined before a turn, then reflects the last usage", async () => {
  const session = make({ query: arrayQuery([usageMsg()]) });
  expect(session.getContextUsage()).toBeUndefined();
  await session.prompt("go");
  expect(session.getContextUsage()).toEqual({ tokens: 100 });
});

test("clearing stale results takes what it freed off the fill the next check reads", async () => {
  let cleared = 60;
  const store: SessionsStore = {
    ...fakeStore("s"),
    resolveResume: () => {
      const clearedTokens = cleared;
      cleared = 0;
      return { sessionId: "s", clearedTokens };
    },
  };
  const session = make({ query: arrayQuery([usageMsg()]), store });
  await session.prompt("go");
  cleared = 60;
  expect(session.clearStaleToolResults()).toBe(60);
  expect(session.getContextUsage()).toEqual({ tokens: 40 });
  expect(session.clearStaleToolResults()).toBe(0);
  expect(session.getContextUsage()).toEqual({ tokens: 40 });
});

function toolInputDeltaMsg(partialJson: string, sessionId = "s"): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: partialJson },
    },
    session_id: sessionId,
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
}

test("subscribeLiveness ticks per SDK message, including tool-input deltas the wire drops (PRODUCT-1632)", async () => {
  const session = make({
    query: arrayQuery([
      toolInputDeltaMsg('{"command":"cat > /tmp/brain.py'),
      toolInputDeltaMsg(" << 'PYEOF'"),
      textMsg("ok"),
    ]),
  });
  const wire: WireEvent[] = [];
  let ticks = 0;
  session.subscribe((e) => wire.push(e));
  const unsub = session.subscribeLiveness(() => ticks++);

  await session.prompt("write it");

  expect(wire).toEqual([{ type: "text", data: "ok" }]);
  expect(ticks).toBe(3);

  unsub();
  await session.prompt("again");
  expect(ticks).toBe(3);
});

function messageStartMsg(parentToolUseId: string | null): SDKMessage {
  return {
    type: "stream_event",
    event: { type: "message_start", message: {} },
    session_id: "s",
    parent_tool_use_id: parentToolUseId,
  } as unknown as SDKMessage;
}

test("subscribeAssistantMessageStart fires per main-thread message_start, never for a subagent's", async () => {
  const session = make({
    query: arrayQuery([
      messageStartMsg(null),
      textMsg("one"),
      messageStartMsg("toolu_sub"),
      messageStartMsg(null),
      textMsg("two"),
      usageMsg(),
    ]),
  });
  const wire: WireEvent[] = [];
  let starts = 0;
  session.subscribe((e) => wire.push(e));
  const unsub = session.subscribeAssistantMessageStart(() => starts++);

  await session.prompt("go");

  expect(wire.map((e) => e.type)).toEqual(["text", "text", "usage"]);
  expect(starts).toBe(2);

  unsub();
  await session.prompt("again");
  expect(starts).toBe(2);
});

function streamMsg(event: unknown, parentToolUseId: string | null = null) {
  return {
    type: "stream_event",
    event,
    session_id: "s",
    parent_tool_use_id: parentToolUseId,
  } as unknown as SDKMessage;
}

test("subscribeReplyBeats reports main-thread tool-call opens and clean stops, after their frames", async () => {
  const toolOpen = (name: string, parent: string | null = null) =>
    streamMsg(
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: `id-${name}`, name, input: {} },
      },
      parent,
    );
  const stop = (stop_reason: string) =>
    streamMsg({ type: "message_delta", delta: { stop_reason } });
  const session = make({
    query: arrayQuery([
      messageStartMsg(null),
      textMsg("Done."),
      toolOpen("mcp__houston__suggest_actions"),
      toolOpen("Bash", "toolu_sub"),
      stop("tool_use"),
      messageStartMsg(null),
      textMsg("All set."),
      stop("end_turn"),
      usageMsg(),
    ]),
  });
  const order: string[] = [];
  session.subscribe((e) => order.push(e.type));
  session.subscribeReplyBeats((beat) =>
    order.push(
      beat.type === "tool_call_start" ? `beat:${beat.name}` : "beat:answer_end",
    ),
  );

  await session.prompt("go");

  expect(order).toEqual([
    "text",
    "beat:mcp__houston__suggest_actions",
    "text",
    "beat:answer_end",
    "usage",
  ]);
});

function initMsg(servers: unknown, sessionId = "s"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    mcp_servers: servers,
  } as unknown as SDKMessage;
}
function missingHoustonToolResult(sessionId = "s"): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "t1",
          is_error: true,
          content:
            "<tool_use_error>Error: No such tool available: mcp__houston__integration_execute</tool_use_error>",
        },
      ],
    },
    session_id: sessionId,
  } as unknown as SDKMessage;
}

test("a resume whose init lacks the houston server reruns fresh with the history prefix", async () => {
  const store = fakeStore("sess-old");
  const prompts: string[] = [];
  const optionsSeen: Options[] = [];
  const query: ClaudeQuery = (params) => {
    prompts.push(params.prompt);
    optionsSeen.push(params.options);
    if (params.options.resume)
      return arrayQuery([
        initMsg([{ name: "houston", status: "failed" }], "sess-old"),
        textMsg("tool-less answer", "sess-old"),
        usageMsg("sess-old"),
      ])(params);
    return arrayQuery([
      initMsg([{ name: "houston", status: "connected" }], "sess-new"),
      textMsg("recovered", "sess-new"),
      usageMsg("sess-new"),
    ])(params);
  };
  const session = make({
    query,
    store,
    freshRetryPromptPrefix: () => "[canonical replay]\n",
  });
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));

  await session.prompt("run the routine");

  expect(prompts).toEqual([
    "run the routine",
    "[canonical replay]\nrun the routine",
  ]);
  expect(optionsSeen[0]?.resume).toBe("sess-old");
  expect(optionsSeen[1] && "resume" in optionsSeen[1]).toBe(false);
  expect(optionsSeen[0]?.abortController?.signal.aborted).toBe(true);
  expect(events.filter((e) => e.type === "text")).toEqual([
    { type: "text", data: "recovered" },
  ]);
  expect(events.some((e) => e.type === "provider_error")).toBe(false);
  expect(store.setCalls).toEqual([["c1", "sess-new"]]);
});

test("the live signature (a houston tool answered 'No such tool') also reruns fresh", async () => {
  const store = fakeStore("sess-old");
  let call = 0;
  const query: ClaudeQuery = (params) => {
    call++;
    if (call === 1)
      return arrayQuery([
        initMsg([{ name: "houston", status: "connected" }], "sess-old"),
        missingHoustonToolResult("sess-old"),
        textMsg("integrations are missing", "sess-old"),
        usageMsg("sess-old"),
      ])(params);
    return arrayQuery([textMsg("recovered", "sess-new"), usageMsg("sess-new")])(
      params,
    );
  };
  const session = make({ query, store });
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));

  await session.prompt("go");

  expect(call).toBe(2);
  expect(events.filter((e) => e.type === "text")).toEqual([
    { type: "text", data: "recovered" },
  ]);
});

test("a resume that calls a houston tool this turn left out keeps going, without a rerun", async () => {
  const store = fakeStore("sess-old");
  let call = 0;
  const query: ClaudeQuery = (params) => {
    call++;
    return arrayQuery([
      initMsg([{ name: "houston", status: "connected" }], "sess-old"),
      textMsg("Here are three more.", "sess-old"),
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              is_error: true,
              content:
                "<tool_use_error>Error: No such tool available: mcp__houston__suggest_actions</tool_use_error>",
            },
          ],
        },
        session_id: "sess-old",
      } as unknown as SDKMessage,
      usageMsg("sess-old"),
    ])(params);
  };
  const session = make({
    query,
    store,
    baseOptions: {
      allowedTools: ["mcp__houston__ask_user"],
    } as Options,
    freshRetryPromptPrefix: () => "[canonical replay]\n",
  });
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));

  await session.prompt("Give me three more.");

  expect(call).toBe(1);
  expect(events.filter((e) => e.type === "text")).toEqual([
    { type: "text", data: "Here are three more." },
  ]);
  expect(store.setCalls).toEqual([["c1", "sess-old"]]);
});

test("a FRESH session without the houston server fails the turn visibly, no retry loop", async () => {
  let call = 0;
  const query: ClaudeQuery = (params) => {
    call++;
    return arrayQuery([
      initMsg([], "sess-new"),
      textMsg("tool-less answer", "sess-new"),
      usageMsg("sess-new"),
    ])(params);
  };
  const session = make({ query, store: fakeStore() });
  const events: WireEvent[] = [];
  session.subscribe((e) => events.push(e));

  await session.prompt("go");

  expect(call).toBe(1);
  expect(events.some((e) => e.type === "text")).toBe(false);
  const error = events.find((e) => e.type === "provider_error");
  expect(error).toBeDefined();
  expect(JSON.stringify(error)).toContain("did not attach");
});
