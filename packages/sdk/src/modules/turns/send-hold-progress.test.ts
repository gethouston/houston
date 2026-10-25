import { EngineError, HoustonEngineClient } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { ScopeStore } from "../../store";
import { observeConversation } from "./observe-stream";
import { observerSettled, sendHolding } from "./send-hold";
import { StreamRegistry, streamKey } from "./stream-registry";
import { TurnSink } from "./turn-sink";
import { ConversationVmOutput } from "./vm-output";

afterEach(() => vi.useRealTimers());

test("real stream frames extend a held send, then silence expires it fifteen minutes after the last progress", async () => {
  vi.useFakeTimers();
  const sink = new TurnSink({
    agentPath: "a",
    sessionKey: "c",
    mode: "turn",
    output: new ConversationVmOutput(new ScopeStore()),
    stop: () => {},
    reloadHistory: async () => [],
    historyGuard: () => false,
  });
  let settled = false;
  const result = sendHolding(
    async () => {
      throw new EngineError(409, '{"error":"turn running"}');
    },
    sink,
    new AbortController().signal,
    undefined,
    { onHold: () => sink.holdSend() },
  ).catch((e) => e);
  void result.then(() => {
    settled = true;
  });
  const progress = setInterval(
    () => sink.onFrame({ type: "text", data: "work", turnId: "prior" }),
    60_000,
  );
  await vi.advanceTimersByTimeAsync(16 * 60_000);
  expect(settled).toBe(false);
  clearInterval(progress);
  const idle = setInterval(
    () =>
      sink.onFrame({
        type: "sync",
        data: { running: false, partial: "", seq: 1 },
      }),
    60_000,
  );
  await vi.advanceTimersByTimeAsync(15 * 60_000 - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toBe(true);
  await expect(result).resolves.toBeInstanceOf(EngineError);
  clearInterval(idle);
  sink.dispose();
});

test("an observed turn that really dies releases a held send after sixteen minutes of live progress", async () => {
  vi.useFakeTimers();
  const registry = new StreamRegistry();
  const key = streamKey("a", "c");
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  let requests = 0;
  const engine = new HoustonEngineClient({
    baseUrl: "http://host",
    fetch: async () => {
      if (++requests > 1) return new Response("gone", { status: 404 });
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  const output = new ConversationVmOutput(new ScopeStore());
  observeConversation(engine, "a", "c", output, 0, registry, {
    backoff: { initialMs: 1, maxMs: 1, jitter: () => 1 },
  });
  const observer = registry.get(key);
  if (!observer) throw new Error("no observer");
  let seq = 0;
  const frame = () =>
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ type: "sync", seq: ++seq, data: { running: true, partial: "work", seq, turnId: "prior" } })}\n\n`,
      ),
    );
  frame();
  await vi.advanceTimersByTimeAsync(0);
  const result = observerSettled(registry, key, observer, undefined);
  let settled = false;
  void result.then(() => {
    settled = true;
  });
  const progress = setInterval(frame, 15_000);
  await vi.advanceTimersByTimeAsync(16 * 60_000);
  expect(settled).toBe(false);
  clearInterval(progress);
  controller.error(new TypeError("connection lost"));
  await vi.advanceTimersByTimeAsync(100);
  await expect(result).resolves.toBe(true);
  expect(requests).toBeGreaterThan(1);
  expect(registry.get(key)).toBeUndefined();
  registry.disposeAll();
});
