import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetCodexRefusalMemory } from "../../ai/codex-terse-refusal";
import {
  makeProviderResponseRecorder,
  runWithProviderResponseCapture,
} from "../../ai/provider-response";
import { toWire } from "./wire";

/**
 * The recorded response only adds facts to the card: it never changes how a
 * failure classifies. A status pi kept out of the message (the SSE path) must
 * not turn an unclassified failure into a 500/429/402/401 card, and a stale
 * status from an earlier attempt must not reclassify a later one.
 */

function failure(provider: string, errorMessage: string): AgentSessionEvent {
  const message: AssistantMessage = {
    role: "assistant",
    content: [],
    api: "openai-responses",
    provider,
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "error",
    errorMessage,
    timestamp: 0,
  };
  return { type: "turn_end", message, toolResults: [] };
}

type Handler = (event: unknown) => unknown;

function recorder(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  makeProviderResponseRecorder()({
    on: (event: string, handler: Handler) => {
      handlers[event] = handler;
    },
  } as never);
  return handlers;
}

function kindOf(wire: ReturnType<typeof toWire>): string | undefined {
  return wire && "data" in wire ? (wire.data as { kind: string }).kind : "";
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  resetCodexRefusalMemory();
});

test.each([
  ["openai", "Request failed", 500],
  ["openai", "Request failed", 429],
  ["openai", "Request failed", 402],
  ["openai", "Request failed", 401],
  ["openai-codex", '{"detail":"Bad Request"}', 503],
  ["anthropic", "Invalid API key", 503],
  ["openai", "No API key found for openai.", 429],
])("%s %j with a recorded %i classifies as without it", (provider, text, status) => {
  const baseline = kindOf(toWire(failure(provider, text)));
  resetCodexRefusalMemory();
  const on = recorder();
  const recorded = runWithProviderResponseCapture(() => {
    on.after_provider_response?.({
      type: "after_provider_response",
      status,
      headers: {},
    });
    return kindOf(toWire(failure(provider, text)));
  });
  expect(recorded).toBe(baseline);
});

test("a stale 503 from an earlier attempt neither reclassifies nor tags the next failure", () => {
  const on = recorder();
  const [authKind, nextCard] = runWithProviderResponseCapture(() => {
    on.before_provider_request?.({ type: "before_provider_request" });
    on.after_provider_response?.({
      type: "after_provider_response",
      status: 503,
      headers: { "x-request-id": "stale" },
    });
    // pi's auto-retry: a new turn starts, and the credential read throws
    // before any request goes out.
    on.turn_start?.({ type: "turn_start", turnIndex: 0, timestamp: 0 });
    const auth = kindOf(
      toWire(failure("openai-codex", "No API key found for openai-codex.")),
    );
    const next = toWire(failure("openai", "Request failed"));
    return [auth, next && "data" in next ? next.data : undefined] as const;
  });
  expect(authKind).toBe("unauthenticated");
  expect(nextCard).not.toHaveProperty("http_status");
  expect(nextCard).not.toHaveProperty("request_id");
});

test("a recorded failure is read once", () => {
  const on = recorder();
  const [first, second] = runWithProviderResponseCapture(() => {
    on.after_provider_response?.({
      type: "after_provider_response",
      status: 400,
      headers: { "x-request-id": "once" },
    });
    const a = toWire(failure("openai", "Request failed"));
    const b = toWire(failure("openai", "Request failed"));
    return [a && "data" in a && a.data, b && "data" in b && b.data] as const;
  });
  expect(first).toMatchObject({ http_status: 400, request_id: "once" });
  expect(second).not.toHaveProperty("http_status");
  expect(second).not.toHaveProperty("request_id");
});
