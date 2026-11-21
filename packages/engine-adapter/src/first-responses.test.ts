import type {
  EventStreamOptions,
  HoustonEngineClient,
} from "@houston/runtime-client";
import { expect, test } from "vitest";
import { type FirstResponseEvent, subscribeFirstResponses } from "./index";
import { streamTurn } from "./turn-stream";

function answeringEngine(text: string): HoustonEngineClient {
  return {
    async streamEvents(_id: string, o: EventStreamOptions) {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", seq: 0 },
      });
      o.onEvent({ type: "text", data: text });
      o.onEvent({ type: "done", data: null });
    },
    async sendMessage() {},
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
}

const tuning = {
  idleTimeoutMs: 2_000,
  backoff: { initialMs: 1, maxMs: 2, jitter: () => 0 },
};

test("a sent turn reports its first response to subscribers, with its conversation", async () => {
  const seen: FirstResponseEvent[] = [];
  const off = subscribeFirstResponses((e) => seen.push(e));

  await streamTurn(
    answeringEngine("Hi"),
    "Ws/Agent",
    "activity-1",
    "hello",
    async () => {},
    { tuning },
  );
  off();

  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({
    agentPath: "Ws/Agent",
    sessionKey: "activity-1",
    response: { outcome: "first_text" },
  });
});

test("an unsubscribed listener hears nothing", async () => {
  const seen: FirstResponseEvent[] = [];
  subscribeFirstResponses((e) => seen.push(e))();

  await streamTurn(
    answeringEngine("Hi"),
    "Ws/Agent",
    "activity-2",
    "hello",
    async () => {},
    { tuning },
  );

  expect(seen).toEqual([]);
});
