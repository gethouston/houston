import {
  type Api,
  type AssistantMessage,
  type Context,
  createAssistantMessageEventStream,
  type Model,
} from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { hedgedModelRuntime } from "./hedged-runtime";

/**
 * The hedge's deadline follows the request it races: a provider reads the
 * whole prompt before its first byte, so an 800k-token request resent at the
 * small-prompt deadline would be cut while it is being read.
 */

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A model runtime whose requests never answer; counts what goes out. */
function silentRuntime() {
  const sent: AbortSignal[] = [];
  const runtime = {
    streamSimple(
      _model: Model<Api>,
      _context: Context,
      options?: { signal?: AbortSignal },
    ) {
      const stream = createAssistantMessageEventStream();
      if (options?.signal) sent.push(options.signal);
      return stream;
    },
  } as unknown as ModelRuntime;
  return { sent, runtime };
}

const model = { provider: "anthropic", id: "claude-sonnet-4-6" } as Model<Api>;

function answeredAt(totalTokens: number): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: 0,
  };
}

function request(context: Context) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { sent, runtime } = silentRuntime();
  const controller = new AbortController();
  hedgedModelRuntime(runtime).streamSimple(model, context, {
    signal: controller.signal,
  });
  return { sent, stop: () => controller.abort() };
}

test("an 800k-token request is not resent at the small-prompt deadline", async () => {
  vi.useFakeTimers();
  const { sent, stop } = request({
    messages: [answeredAt(800_000)],
  });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(sent).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(39_999);
  expect(sent).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(sent).toHaveLength(2);
  stop();
});

test("a small request is resent at the small-prompt deadline", async () => {
  vi.useFakeTimers();
  const { sent, stop } = request({
    messages: [{ role: "user", content: "hello", timestamp: 0 }],
  });
  await vi.advanceTimersByTimeAsync(14_999);
  expect(sent).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(sent).toHaveLength(2);
  stop();
});
