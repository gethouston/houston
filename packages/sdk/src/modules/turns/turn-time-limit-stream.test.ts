import { HoustonEngineClient } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { ScopeStore } from "../../store";
import { MultiplexFeedOutput } from "./feed-output";
import { StreamRegistry } from "./stream-registry";
import { streamTurn } from "./turn-stream";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

afterEach(() => vi.useRealTimers());

test("a healthy four-hour stream survives watchdogs and the first-response measurement timeout", async () => {
  vi.useFakeTimers();
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
  });
  const emit = (frame: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
  const firstResponse = vi.fn();
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  const registry = new StreamRegistry();
  const engine = new HoustonEngineClient({
    baseUrl: "http://host",
    fetch: async (input, init) => {
      if (String(input).endsWith("/events")) {
        init?.signal?.addEventListener("abort", () => controller.close(), {
          once: true,
        });
        emit({
          type: "sync",
          data: { running: false, partial: "", seq: 0 },
          seq: 0,
        });
        return new Response(body, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      if (init?.method === "POST") {
        emit({
          type: "tool_start",
          data: { name: "bash", args: {} },
          turnId: "t1",
          seq: 1,
        });
        return Response.json({ turnId: "t1" }, { status: 202 });
      }
      return Response.json({ messages: [] });
    },
  });
  const output = new MultiplexFeedOutput([
    vm,
    {
      pushFeedItem: () => {},
      sessionStatus: () => {},
      persistBoardStatus: async () => {},
      firstResponse,
    },
  ]);
  const pending = streamTurn(engine, "a", "c", "research", output, registry);
  const snap = () =>
    store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  const heartbeat = setInterval(
    () => controller.enqueue(encoder.encode(": heartbeat\n\n")),
    15_000,
  );
  try {
    await vi.advanceTimersByTimeAsync(4 * 60 * 60_000);
    expect(snap().running).toBe(true);
    expect(
      snap().feed.some((item) => item.feed_type === "system_message"),
    ).toBe(false);
    expect(firstResponse).toHaveBeenCalledExactlyOnceWith(
      "a",
      "c",
      expect.objectContaining({ outcome: "timeout" }),
    );
    emit({
      type: "error",
      data: { message: "saved", code: "turn_time_limit" },
      turnId: "t1",
      seq: 2,
    });
    await pending;
    expect(snap().sessionStatus).toBe("completed");
    expect(snap().boardStatus).toBe("needs_you");
    expect(snap().feed).toContainEqual(
      expect.objectContaining({ notice: "turn_time_limit" }),
    );
  } finally {
    clearInterval(heartbeat);
    registry.disposeAll();
    await pending;
  }
});
