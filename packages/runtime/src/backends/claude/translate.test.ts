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
