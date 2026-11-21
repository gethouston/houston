import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { expect, test, vi } from "vitest";
import { createClaudeCallTimer } from "./model-calls";

function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const msg = (m: unknown) => m as SDKMessage;
const init = msg({ type: "system", subtype: "init", session_id: "s" });
const stream = (event: unknown, parent: string | null = null) =>
  msg({ type: "stream_event", parent_tool_use_id: parent, event });
const toolResult = (parent: string | null = null) =>
  msg({ type: "user", parent_tool_use_id: parent, message: { content: [] } });
const messageStart = (usage: Record<string, number>) =>
  stream({
    type: "message_start",
    message: { model: "claude-opus-5-5", usage },
  });
const blockStart = (type: string) =>
  stream({ type: "content_block_start", content_block: { type } });

test("spawn-to-init, then one call per Messages API response", () => {
  const c = clock();
  const timer = createClaudeCallTimer(c.now);
  c.advance(800);
  expect(timer(init)).toEqual([{ type: "harness_init", ms: 800 }]);
  c.advance(2100);
  timer(
    messageStart({
      input_tokens: 3,
      cache_read_input_tokens: 18_000,
      cache_creation_input_tokens: 500,
      output_tokens: 1,
    }),
  );
  c.advance(300);
  timer(blockStart("thinking"));
  c.advance(1200);
  timer(blockStart("tool_use"));
  timer(stream({ type: "message_delta", usage: { output_tokens: 90 } }));
  c.advance(100);
  expect(timer(stream({ type: "message_stop" }))).toEqual([
    {
      type: "call",
      call: {
        provider: "anthropic",
        model: "claude-opus-5-5",
        ttfbMs: 2100,
        firstTokenMs: 1500,
        firstBlockMs: 300,
        inputTokens: 3,
        cacheReadTokens: 18_000,
        cacheWriteTokens: 500,
        outputTokens: 90,
      },
    },
  ]);
  c.advance(4000);
  timer(toolResult());
  c.advance(1700);
  timer(messageStart({ input_tokens: 40, cache_read_input_tokens: 18_500 }));
  timer(blockStart("text"));
  const [second] = timer(stream({ type: "message_stop" }));
  expect(second).toMatchObject({
    type: "call",
    call: { ttfbMs: 1700, firstTokenMs: 0, firstBlockMs: 0, inputTokens: 40 },
  });
});

test("subagent streams and tool results are another context", () => {
  const c = clock();
  const timer = createClaudeCallTimer(c.now);
  timer(init);
  c.advance(500);
  timer(messageStart({ input_tokens: 1 }));
  timer(toolResult("toolu_1"));
  expect(timer(stream({ type: "message_start" }, "toolu_1"))).toEqual([]);
  expect(timer(stream({ type: "message_stop" }, "toolu_1"))).toEqual([]);
  const [call] = timer(stream({ type: "message_stop" }));
  expect(call).toMatchObject({ call: { ttfbMs: 500 } });
});

test("a response that never finishes reports no call; a second init is not a spawn", () => {
  const c = clock();
  const timer = createClaudeCallTimer(c.now);
  timer(init);
  timer(messageStart({ input_tokens: 1 }));
  timer(blockStart("text"));
  expect(timer(init)).toEqual([]);
  expect(timer(msg({ type: "result", subtype: "success" }))).toEqual([]);
});

test("the CLI's own ttft_ms wins over the inferred request start", () => {
  const c = clock();
  const timer = createClaudeCallTimer(c.now);
  timer(init);
  c.advance(2005);
  timer(
    msg({
      type: "stream_event",
      parent_tool_use_id: null,
      ttft_ms: 1983,
      event: { type: "message_start", message: { model: "m", usage: {} } },
    }),
  );
  const [call] = timer(stream({ type: "message_stop" }));
  expect(call).toMatchObject({ call: { ttfbMs: 1983 } });
});

test("a malformed stream event never throws into the turn", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const timer = createClaudeCallTimer(clock().now);
  timer(init);
  expect(
    timer(msg({ type: "stream_event", parent_tool_use_id: null })),
  ).toEqual([]);
  const hostile = msg({
    type: "stream_event",
    parent_tool_use_id: null,
    get event(): never {
      throw new Error("bad frame");
    },
  });
  expect(timer(hostile)).toEqual([]);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(timer(messageStart({ input_tokens: 1 }))).toEqual([]);
  expect(timer(stream({ type: "message_stop" }))).toEqual([]);
  warn.mockRestore();
});

test("a response that only thought has a first block and no first token", () => {
  const c = clock();
  const timer = createClaudeCallTimer(c.now);
  timer(init);
  timer(messageStart({ input_tokens: 1 }));
  c.advance(250);
  timer(blockStart("redacted_thinking"));
  const [call] = timer(stream({ type: "message_stop" }));
  expect(call).toMatchObject({ call: { firstBlockMs: 250 } });
  expect(call?.type === "call" && call.call.firstTokenMs).toBeUndefined();
});
