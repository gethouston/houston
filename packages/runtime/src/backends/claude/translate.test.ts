import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import { createStreamTranslator, normalizeUsage } from "./translate";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// --- fixtures ---------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: test fixtures cast to SDKMessage.
function streamEvent(event: any): SDKMessage {
  return {
    type: "stream_event",
    event,
    parent_tool_use_id: null,
    uuid: "u",
    session_id: "s",
  } as unknown as SDKMessage;
}
function textDelta(text: string): SDKMessage {
  return streamEvent({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  });
}
function thinkingDelta(thinking: string): SDKMessage {
  return streamEvent({
    type: "content_block_delta",
    index: 0,
    delta: { type: "thinking_delta", thinking },
  });
}
function toolStart(index: number, id: string, name: string): SDKMessage {
  return streamEvent({
    type: "content_block_start",
    index,
    content_block: { type: "tool_use", id, name, input: {} },
  });
}
function jsonDelta(index: number, partial_json: string): SDKMessage {
  return streamEvent({
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json },
  });
}
function blockStop(index: number): SDKMessage {
  return streamEvent({ type: "content_block_stop", index });
}
function toolResult(id: string, isError: boolean): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, is_error: isError }],
    },
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
}
function result(
  usage: unknown,
  over: Record<string, unknown> = {},
): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    usage,
    ...over,
  } as unknown as SDKMessage;
}

function assistantUsage(
  usage: unknown,
  over: Record<string, unknown> = {},
): SDKMessage {
  return {
    type: "assistant",
    message: { role: "assistant", model: "m", content: [], usage },
    parent_tool_use_id: null,
    ...over,
  } as unknown as SDKMessage;
}

function collect(msgs: SDKMessage[]): { events: WireEvent[]; ctx: number[] } {
  const ctx: number[] = [];
  const t = createStreamTranslator({ onContextTokens: (n) => ctx.push(n) });
  const events: WireEvent[] = [];
  for (const m of msgs) for (const e of t.translate(m)) events.push(e);
  return { events, ctx };
}

// --- normalizeUsage ---------------------------------------------------------

test("normalizeUsage matches the pi fixture (context = total - output)", () => {
  // input 100 + output 20 + cacheRead 300 + cacheWrite 50 = 470 total; 450 fills.
  expect(
    normalizeUsage({
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 300,
      cache_creation_input_tokens: 50,
    }),
  ).toEqual({ context_tokens: 450, output_tokens: 20, cached_tokens: 300 });
});

test("normalizeUsage degrades to null with no input signal", () => {
  expect(normalizeUsage(undefined)).toBeNull();
  expect(normalizeUsage(null)).toBeNull();
  expect(normalizeUsage({})).toBeNull();
  // context = total - output = input + caches (total is summed from the parts).
  expect(normalizeUsage({ input_tokens: 10, output_tokens: 99 })).toEqual({
    context_tokens: 10,
    output_tokens: 99,
    cached_tokens: 0,
  });
});

// --- streaming mappings -----------------------------------------------------

test("text_delta / thinking_delta map to text / thinking frames", () => {
  const { events } = collect([textDelta("hello "), thinkingDelta("hmm")]);
  expect(events).toEqual([
    { type: "text", data: "hello " },
    { type: "thinking", data: "hmm" },
  ]);
});

test("a follow-up text block gets a paragraph-break prefix on its first delta (HOU-857)", () => {
  // The screenshot bug: text → tool call → text streams as distinct content
  // blocks, but the bare deltas concatenate downstream into "…for you now.Go
  // ahead…". The new block's first delta must carry the separator.
  const blockStart = (index: number, type: string) =>
    streamEvent({
      type: "content_block_start",
      index,
      content_block: { type },
    });
  const { events } = collect([
    blockStart(0, "text"),
    textDelta("I'll get that set up for you now."),
    toolStart(1, "t1", "connect"),
    blockStop(1),
    toolResult("t1", false),
    blockStart(0, "text"),
    textDelta("Go ahead and sign in."),
    textDelta(" Once connected, I'll confirm."),
  ]);
  expect(events).toEqual([
    { type: "text", data: "I'll get that set up for you now." },
    { type: "tool_start", data: { name: "connect", args: {} } },
    { type: "tool_end", data: { name: "connect", isError: false } },
    // Separator rides the follow-up block's FIRST delta only.
    { type: "text", data: "\n\nGo ahead and sign in." },
    { type: "text", data: " Once connected, I'll confirm." },
  ]);
});

test("thinking blocks separate independently; the first of each kind is never prefixed", () => {
  const blockStart = (index: number, type: string) =>
    streamEvent({
      type: "content_block_start",
      index,
      content_block: { type },
    });
  const { events } = collect([
    blockStart(0, "thinking"),
    thinkingDelta("first thoughts"),
    blockStart(1, "thinking"),
    thinkingDelta("second thoughts"),
    // First TEXT block after thinking-only content: text starts fresh.
    blockStart(2, "text"),
    textDelta("Hello"),
  ]);
  expect(events).toEqual([
    { type: "thinking", data: "first thoughts" },
    { type: "thinking", data: "\n\nsecond thoughts" },
    { type: "text", data: "Hello" },
  ]);
});

test("tool_use: accumulated input_json_delta parses into tool_start args at stop", () => {
  const { events } = collect([
    toolStart(1, "t1", "Read"),
    jsonDelta(1, '{"file_'),
    jsonDelta(1, 'path":"a.txt"}'),
    blockStop(1),
  ]);
  expect(events).toEqual([
    {
      type: "tool_start",
      data: { name: "Read", args: { file_path: "a.txt" } },
    },
  ]);
});

test("tool_start with unparseable JSON emits args:{} and logs (never a silent drop)", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { events } = collect([
    toolStart(0, "t9", "Edit"),
    jsonDelta(0, "{not json"),
    blockStop(0),
  ]);
  expect(events).toEqual([
    { type: "tool_start", data: { name: "Edit", args: {} } },
  ]);
  expect(spy).toHaveBeenCalled();
});

test("tool_result maps to tool_end using the buffered tool_use_id → name map", () => {
  const { events } = collect([
    toolStart(0, "abc", "Write"),
    blockStop(0),
    toolResult("abc", true),
  ]);
  expect(events).toEqual([
    { type: "tool_start", data: { name: "Write", args: {} } },
    { type: "tool_end", data: { name: "Write", isError: true } },
  ]);
});

test("a tool_result for an unknown id (replayed/foreign) is dropped", () => {
  const { events } = collect([toolResult("never-seen", false)]);
  expect(events).toEqual([]);
});

test("a tool_result's text rides the tool_end as its content preview (HOU-717)", () => {
  const withContent = {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "abc",
          is_error: false,
          content: [
            { type: "text", text: "line one" },
            { type: "text", text: "line two" },
          ],
        },
      ],
    },
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
  const { events } = collect([
    toolStart(0, "abc", "Grep"),
    blockStop(0),
    withContent,
  ]);
  expect(events).toEqual([
    { type: "tool_start", data: { name: "Grep", args: {} } },
    {
      type: "tool_end",
      data: { name: "Grep", isError: false, content: "line one\nline two" },
    },
  ]);
});

// --- result / usage / context ----------------------------------------------

test("a success result yields a usage frame and updates context tokens", () => {
  const { events, ctx } = collect([
    result({
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 300,
      cache_creation_input_tokens: 50,
    }),
  ]);
  expect(events).toEqual([
    {
      type: "usage",
      data: { context_tokens: 450, output_tokens: 20, cached_tokens: 300 },
    },
  ]);
  expect(ctx).toEqual([450]);
});

test("an agentic turn's usage frame is the LAST request's usage, never the result's turn aggregate", () => {
  // Two API requests (a tool round-trip): the context is re-sent each time, so
  // the result's aggregate (~sum of both) reads far above the real fill. The
  // frame + context tokens must follow the per-request numbers.
  const { events, ctx } = collect([
    assistantUsage({
      input_tokens: 1_000,
      output_tokens: 50,
      cache_read_input_tokens: 30_000,
      cache_creation_input_tokens: 2_000,
    }),
    assistantUsage({
      input_tokens: 500,
      output_tokens: 40,
      cache_read_input_tokens: 33_000,
      cache_creation_input_tokens: 1_000,
    }),
    result({
      input_tokens: 1_500,
      output_tokens: 90,
      cache_read_input_tokens: 63_000,
      cache_creation_input_tokens: 3_000,
    }),
  ]);
  expect(events).toEqual([
    {
      type: "usage",
      data: {
        context_tokens: 34_500,
        output_tokens: 40,
        cached_tokens: 33_000,
      },
    },
  ]);
  expect(ctx).toEqual([33_000, 34_500, 34_500]);
});

test("subagent and errored assistant usage never count toward the context fill", () => {
  const sub = assistantUsage(
    { input_tokens: 400_000, output_tokens: 10, cache_read_input_tokens: 0 },
    { parent_tool_use_id: "task-1" },
  );
  const errored = assistantUsage(
    { input_tokens: 500_000, output_tokens: 0 },
    { error: "overloaded" },
  );
  const { events, ctx } = collect([
    sub,
    errored,
    result({ input_tokens: 100, output_tokens: 5 }),
  ]);
  // The errored assistant emits its provider_error; the usage frame falls back
  // to the result (one clean request never happened this turn).
  expect(events.filter((e) => e.type === "usage")).toEqual([
    {
      type: "usage",
      data: { context_tokens: 100, output_tokens: 5, cached_tokens: 0 },
    },
  ]);
  expect(ctx).toEqual([100]);
});

test("a compact_boundary after the last request re-anchors the turn's usage frame", () => {
  const boundary = {
    type: "system",
    subtype: "compact_boundary",
    compact_metadata: { trigger: "auto", pre_tokens: 900, post_tokens: 120 },
  } as unknown as SDKMessage;
  const { events, ctx } = collect([
    assistantUsage({
      input_tokens: 800,
      output_tokens: 30,
      cache_read_input_tokens: 100,
    }),
    boundary,
    result({ input_tokens: 800, output_tokens: 30 }),
  ]);
  expect(events).toEqual([
    {
      type: "usage",
      data: { context_tokens: 120, output_tokens: 30, cached_tokens: 0 },
    },
  ]);
  expect(ctx).toEqual([900, 120, 120]);
});

test("an error result classifies to a provider_error (with usage first when present)", () => {
  const { events } = collect([
    result(
      { input_tokens: 5, output_tokens: 1 },
      {
        subtype: "error_during_execution",
        errors: ["503 Service Unavailable"],
        api_error_status: 503,
      },
    ),
  ]);
  expect(events).toEqual([
    {
      type: "usage",
      data: { context_tokens: 5, output_tokens: 1, cached_tokens: 0 },
    },
    {
      type: "provider_error",
      data: {
        kind: "provider_internal",
        provider: "anthropic",
        http_status: 503,
        message: "503 Service Unavailable",
      },
    },
  ]);
});

// --- assistant error / dedup ------------------------------------------------

test("an assistant message with a typed error enum emits one provider_error", () => {
  const msg = {
    type: "assistant",
    error: "rate_limit",
    message: { role: "assistant", model: "claude-opus-4-5", content: [] },
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
  const { events } = collect([msg]);
  expect(events).toEqual([
    {
      type: "provider_error",
      data: {
        kind: "rate_limited",
        provider: "anthropic",
        model: "claude-opus-4-5",
        retry_after_seconds: null,
        message: "Claude error: rate_limit",
      },
    },
  ]);
});

test("provider_error is emitted at most once across assistant + result errors", () => {
  const assistant = {
    type: "assistant",
    error: "overloaded",
    message: { role: "assistant", model: "m", content: [] },
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
  const { events } = collect([
    assistant,
    result(
      { input_tokens: 1 },
      { subtype: "error_during_execution", errors: ["x"] },
    ),
  ]);
  expect(events.filter((e) => e.type === "provider_error")).toHaveLength(1);
});

// --- compact boundary / unmapped -------------------------------------------

test("a compact_boundary updates context tokens with post_tokens, emits no frame", () => {
  const boundary = {
    type: "system",
    subtype: "compact_boundary",
    compact_metadata: { trigger: "auto", pre_tokens: 900, post_tokens: 120 },
  } as unknown as SDKMessage;
  const { events, ctx } = collect([boundary]);
  expect(events).toEqual([]);
  expect(ctx).toEqual([120]);
});

test("unmapped messages (system/init, message_start) are dropped", () => {
  const init = {
    type: "system",
    subtype: "init",
    session_id: "s",
  } as SDKMessage;
  const msgStart = streamEvent({ type: "message_start", message: {} });
  expect(collect([init, msgStart]).events).toEqual([]);
});

test("a rate_limit_event carries retry seconds into a later rate_limit error", () => {
  const event = {
    type: "rate_limit_event",
    rate_limit_info: { status: "rejected", resetsAt: Date.now() + 60_000 },
  } as unknown as SDKMessage;
  const err = {
    type: "assistant",
    error: "rate_limit",
    message: { role: "assistant", model: "m", content: [] },
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
  const { events } = collect([event, err]);
  const pe = events.find((e) => e.type === "provider_error");
  expect(pe?.type === "provider_error" && pe.data.kind).toBe("rate_limited");
  // ~60s out; allow a little slack for the clock between fixture + assertion.
  const secs =
    pe?.type === "provider_error" && pe.data.kind === "rate_limited"
      ? pe.data.retry_after_seconds
      : null;
  expect(secs).toBeGreaterThanOrEqual(58);
  expect(secs).toBeLessThanOrEqual(60);
});
