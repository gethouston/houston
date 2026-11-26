import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { resetCodexRefusalMemory } from "../../ai/codex-terse-refusal";
import {
  makeProviderResponseRecorder,
  runWithProviderResponseCapture,
} from "../../ai/provider-response";
import { toWire } from "./wire";

/**
 * An unclassified failure carries what its request ran on (model, effort) and
 * how the provider answered (HTTP status, request id) onto the card, which is
 * all a bug report on it can tell us (the Codex `{"detail":"Bad Request"}`
 * reports carried the body alone).
 */

const TERSE = '{"detail":"Bad Request"}';

function codexFailure(over: Partial<AssistantMessage> = {}): AgentSessionEvent {
  const message: AssistantMessage = {
    role: "assistant",
    content: [],
    api: "openai-codex-responses",
    provider: "openai-codex",
    model: "gpt-6-luna",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "error",
    errorMessage: TERSE,
    thinkingLevel: "medium",
    timestamp: 0,
    ...over,
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

afterEach(() => {
  vi.restoreAllMocks();
  resetCodexRefusalMemory();
});

test("a terse Codex refusal names its model, effort, status and request id", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const on = recorder();
  const wire = runWithProviderResponseCapture(() => {
    on.before_provider_request?.({ type: "before_provider_request" });
    on.after_provider_response?.({
      type: "after_provider_response",
      status: 400,
      headers: { "x-oai-request-id": "oai-1", "cf-ray": "ray-1" },
    });
    return toWire(codexFailure());
  });
  expect(wire).toEqual({
    type: "provider_error",
    data: {
      kind: "unknown",
      provider: "openai-codex",
      raw_excerpt: TERSE,
      model: "gpt-6-luna",
      effort: "medium",
      http_status: 400,
      request_id: "oai-1",
    },
  });
});

test("the provider's own effort wins, and the log line carries the status", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  // A terse Codex refusal logs as a warning (codex-terse-refusal.ts).
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const on = recorder();
  const wire = runWithProviderResponseCapture(() => {
    on.after_provider_response?.({
      type: "after_provider_response",
      status: 400,
      headers: {},
    });
    return toWire(codexFailure({ providerThinkingLevel: "xhigh" }));
  });
  expect(wire).toMatchObject({
    data: { effort: "xhigh", http_status: 400 },
  });
  expect(wire && "data" in wire && wire.data).not.toHaveProperty("request_id");
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("status=400"));
});

test("a failure no response was recorded for still names its model and effort", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const wire = toWire(codexFailure());
  expect(wire && "data" in wire && wire.data).toEqual({
    kind: "unknown",
    provider: "openai-codex",
    raw_excerpt: TERSE,
    model: "gpt-6-luna",
    effort: "medium",
  });
});
