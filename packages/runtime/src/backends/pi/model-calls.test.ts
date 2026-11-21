import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { createPiCallTimer } from "./model-calls";

function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function assistant(over: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    usage: {
      input: 12,
      output: 150,
      cacheRead: 20_000,
      cacheWrite: 300,
      totalTokens: 20_462,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
    ...over,
  } as AssistantMessage;
}

const ev = (e: unknown) => e as AgentSessionEvent;
const update = (type: string) =>
  ev({
    type: "message_update",
    message: assistant(),
    assistantMessageEvent: { type },
  });

test("one request: request -> opened -> first answer token -> usage", () => {
  const c = clock();
  const timer = createPiCallTimer(c.now);
  expect(timer(ev({ type: "turn_start" }))).toBeNull();
  c.advance(1800);
  timer(ev({ type: "message_start", message: assistant() }));
  c.advance(400);
  timer(update("thinking_start"));
  c.advance(200);
  timer(update("text_start"));
  c.advance(900);
  expect(timer(ev({ type: "message_end", message: assistant() }))).toEqual({
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    ttfbMs: 1800,
    firstTokenMs: 600,
    firstBlockMs: 400,
    inputTokens: 12,
    cacheReadTokens: 20_000,
    cacheWriteTokens: 300,
    outputTokens: 150,
  });
});

test("a tool call is a first answer token; each turn_start opens a new call", () => {
  const c = clock();
  const timer = createPiCallTimer(c.now);
  timer(ev({ type: "turn_start" }));
  c.advance(1000);
  timer(ev({ type: "message_start", message: assistant() }));
  c.advance(50);
  timer(update("toolcall_start"));
  expect(
    timer(ev({ type: "message_end", message: assistant() })),
  ).toMatchObject({ firstTokenMs: 50, firstBlockMs: 50 });
  c.advance(700);
  timer(ev({ type: "turn_start" }));
  c.advance(2500);
  timer(ev({ type: "message_start", message: assistant() }));
  const second = timer(ev({ type: "message_end", message: assistant() }));
  expect(second?.ttfbMs).toBe(2500);
  expect(second?.firstTokenMs).toBeUndefined();
  expect(second?.firstBlockMs).toBeUndefined();
});

test("an errored or aborted call reports nothing; the retry is timed from its send", () => {
  const c = clock();
  const timer = createPiCallTimer(c.now);
  timer(ev({ type: "turn_start" }));
  c.advance(300);
  timer(ev({ type: "message_start", message: assistant() }));
  const failed = assistant({ stopReason: "error" });
  expect(timer(ev({ type: "message_end", message: failed }))).toBeNull();
  timer(ev({ type: "auto_retry_start", delayMs: 2000 }));
  c.advance(2000 + 900);
  timer(ev({ type: "message_start", message: assistant() }));
  expect(timer(ev({ type: "message_end", message: assistant() }))?.ttfbMs).toBe(
    900,
  );
  timer(ev({ type: "turn_start" }));
  timer(ev({ type: "message_start", message: assistant() }));
  const aborted = assistant({ stopReason: "aborted" });
  expect(timer(ev({ type: "message_end", message: aborted }))).toBeNull();
});

test("user and tool-result messages are not calls", () => {
  const timer = createPiCallTimer(clock().now);
  timer(ev({ type: "turn_start" }));
  const user = { role: "user", content: "", timestamp: 0 };
  expect(timer(ev({ type: "message_start", message: user }))).toBeNull();
  expect(timer(ev({ type: "message_end", message: user }))).toBeNull();
});
