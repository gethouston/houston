import type {
  EventStreamOptions,
  HoustonEngineClient,
  WireFrame,
} from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type { FeedOutput } from "./feed-output";
import {
  type FirstResponse,
  FirstResponseClock,
  isVisibleActivity,
} from "./first-response";
import { StreamRegistry, type StreamTuning } from "./stream-registry";
import { streamTurn } from "./turn-stream";

const registry = new StreamRegistry();
afterEach(() => {
  registry.disposeAll();
  vi.useRealTimers();
});

const fast: StreamTuning = {
  idleTimeoutMs: 2_000,
  backoff: { initialMs: 1, maxMs: 2, jitter: () => 0 },
};

type Step = { at: number; frame: WireFrame };

async function timedTurn(steps: Step[]): Promise<FirstResponse[]> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", seq: 0 },
      });
      for (const step of steps) {
        vi.setSystemTime(step.at);
        o.onEvent(step.frame);
      }
    },
    async sendMessage() {},
    async getHistory() {
      return { id: "a", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  const reports: FirstResponse[] = [];
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: async () => {},
    firstResponse: (_a, _s, response) => reports.push(response),
  };
  await streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: fast,
  });
  return reports;
}

const tool = (name: string): WireFrame =>
  ({ type: "tool_start", data: { name, args: {} } }) as WireFrame;
const toolEnd = (name: string): WireFrame =>
  ({
    type: "tool_end",
    data: { name, content: "ok", isError: false },
  }) as WireFrame;
const text = (data: string): WireFrame => ({ type: "text", data });
const done: WireFrame = { type: "done", data: null };

test("a tool call before any text is the first activity; the text stays the first response", async () => {
  const reports = await timedTurn([
    { at: 1_002_000, frame: tool("integration_search") },
    { at: 1_003_000, frame: toolEnd("integration_search") },
    { at: 1_020_000, frame: text("Here is what I found") },
    { at: 1_021_000, frame: done },
  ]);
  expect(reports).toEqual([
    {
      outcome: "first_text",
      sentAt: 1_000_000,
      at: 1_020_000,
      firstActivityAt: 1_002_000,
    },
  ]);
});

test("thinking counts as activity, blank thinking does not", async () => {
  const reports = await timedTurn([
    { at: 1_001_000, frame: { type: "thinking", data: "  " } as WireFrame },
    { at: 1_004_000, frame: { type: "thinking", data: "Plan" } as WireFrame },
    { at: 1_009_000, frame: text("Sure") },
    { at: 1_009_500, frame: done },
  ]);
  expect(reports[0]).toMatchObject({
    outcome: "first_text",
    at: 1_009_000,
    firstActivityAt: 1_004_000,
  });
});

test("text as the first item makes first activity and first text the same moment", async () => {
  const reports = await timedTurn([
    { at: 1_003_000, frame: text("Hi") },
    { at: 1_004_000, frame: done },
  ]);
  expect(reports[0]).toMatchObject({
    at: 1_003_000,
    firstActivityAt: 1_003_000,
  });
});

test("a tools-only turn still reports when it first showed activity", async () => {
  const reports = await timedTurn([
    { at: 1_005_000, frame: tool("bash") },
    { at: 1_006_000, frame: toolEnd("bash") },
    { at: 1_007_000, frame: done },
  ]);
  expect(reports[0]).toMatchObject({
    outcome: "no_text",
    firstActivityAt: 1_005_000,
  });
});

test("a turn that fails before showing anything carries no first activity", async () => {
  const reports = await timedTurn([
    {
      at: 1_001_000,
      frame: { type: "error", data: { message: "The model is overloaded" } },
    },
  ]);
  expect(reports).toHaveLength(1);
  expect(reports[0]?.outcome).toBe("error");
  expect(reports[0]).not.toHaveProperty("firstActivityAt");
});

test("a stop after a tool call reports cancelled with its first activity", async () => {
  const reports = await timedTurn([
    { at: 1_002_000, frame: tool("bash") },
    {
      at: 1_008_000,
      frame: { type: "error", data: { message: "Stopped by user" } },
    },
  ]);
  expect(reports).toEqual([
    {
      outcome: "cancelled",
      sentAt: 1_000_000,
      at: 1_008_000,
      firstActivityAt: 1_002_000,
    },
  ]);
});

test("an engine restart after thinking reports interrupted with its first activity", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  let nonce: string | undefined;
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", seq: 0 },
      });
      while (nonce === undefined) await new Promise((r) => setTimeout(r, 2));
      o.onEvent({ type: "user", data: { nonce }, turnId: "t1" } as WireFrame);
      vi.setSystemTime(1_003_000);
      o.onEvent({ type: "thinking", data: "Plan", turnId: "t1" } as WireFrame);
      vi.setSystemTime(1_009_000);
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", seq: 0, resync: true },
      } as WireFrame);
      await new Promise<void>((r) =>
        o.signal?.addEventListener("abort", () => r(), { once: true }),
      );
    },
    async sendMessage(_id: string, _t: string, opts?: { nonce?: string }) {
      nonce = opts?.nonce;
    },
    async getHistory() {
      return {
        id: "a",
        title: "",
        messages: [
          { role: "user", content: "hi", turnId: "t1" },
          {
            role: "assistant",
            content: "",
            turnId: "t1",
            interrupted: { resumed: false },
          },
        ],
      };
    },
  } as unknown as HoustonEngineClient;
  const reports: FirstResponse[] = [];
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: async () => {},
    firstResponse: (_a, _s, response) => reports.push(response),
  };
  await streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: fast,
  });
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({
    outcome: "interrupted",
    firstActivityAt: 1_003_000,
  });
});

test("a timeout after a tool call keeps the activity it showed", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  const reports: FirstResponse[] = [];
  const clock = new FirstResponseClock((r) => reports.push(r), 20);
  vi.setSystemTime(1_004_000);
  clock.pushed({ feed_type: "tool_call", data: { name: "bash", input: {} } });
  await new Promise((r) => setTimeout(r, 40));
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({
    outcome: "timeout",
    sentAt: 1_000_000,
    firstActivityAt: 1_004_000,
  });
});

test("a tool replayed by a running sync after a reconnect is the first activity", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  let sent = false;
  let connects = 0;
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      connects++;
      if (connects === 1) {
        o.onEvent({
          type: "sync",
          data: { running: false, partial: "", seq: 0 },
        });
        while (!sent) await new Promise((r) => setTimeout(r, 2));
        return;
      }
      vi.setSystemTime(1_006_000);
      o.onEvent({
        type: "sync",
        data: {
          running: true,
          partial: "",
          seq: 3,
          turnId: "t-1",
          tools: [{ name: "integration_search", input: {} }],
        },
      } as WireFrame);
      vi.setSystemTime(1_012_000);
      o.onEvent({ type: "text", data: "Found it", turnId: "t-1" } as WireFrame);
      o.onEvent({ type: "done", data: null, turnId: "t-1" } as WireFrame);
    },
    async sendMessage() {
      sent = true;
    },
    async getHistory() {
      return { id: "a", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  const reports: FirstResponse[] = [];
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: async () => {},
    firstResponse: (_a, _s, response) => reports.push(response),
  };
  await streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: fast,
  });
  expect(connects).toBe(2);
  expect(reports).toEqual([
    {
      outcome: "first_text",
      sentAt: 1_000_000,
      at: 1_012_000,
      turnId: "t-1",
      firstActivityAt: 1_006_000,
    },
  ]);
});

test("the clock stamps only the first activity, and nothing after its report", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(5_000);
  const reports: FirstResponse[] = [];
  const clock = new FirstResponseClock((r) => reports.push(r));
  vi.setSystemTime(6_000);
  clock.pushed({ feed_type: "user_message", data: "hi" });
  clock.pushed({ feed_type: "tool_call", data: { name: "read", input: {} } });
  vi.setSystemTime(7_000);
  clock.pushed({ feed_type: "thinking_streaming", data: "more" });
  vi.setSystemTime(8_000);
  clock.pushed({ feed_type: "assistant_text_streaming", data: "Done" });
  clock.pushed({ feed_type: "assistant_text", data: "Done again" });
  expect(reports).toEqual([
    { outcome: "first_text", sentAt: 5_000, at: 8_000, firstActivityAt: 6_000 },
  ]);
});

test("only thinking, tool calls and visible text are activity", () => {
  const visible = [
    { feed_type: "tool_call", data: { name: "x", input: {} } },
    { feed_type: "thinking_streaming", data: "a" },
    { feed_type: "thinking", data: "a" },
    { feed_type: "assistant_text_streaming", data: "a" },
    { feed_type: "assistant_text", data: "a" },
  ];
  const invisible = [
    { feed_type: "user_message", data: "hi" },
    { feed_type: "tool_result", data: { name: "x", content: "" } },
    { feed_type: "thinking_streaming", data: "\n" },
    { feed_type: "assistant_text_streaming", data: " " },
    { feed_type: "system_message", data: "Reconnecting" },
    { feed_type: "final_result", data: { result: "" } },
  ];
  expect(visible.map(isVisibleActivity)).toEqual(visible.map(() => true));
  expect(invisible.map(isVisibleActivity)).toEqual(invisible.map(() => false));
});
