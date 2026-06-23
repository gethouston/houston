import { expect, test } from "bun:test";
import type {
  AssistantMessage,
  Usage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { normalizeUsage, toWire } from "./wire";

/** A valid pi `Usage` for fixtures; `cost` is required by the type. */
function usage(partial: Partial<Usage>): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    ...partial,
  };
}

/** A minimal valid assistant message carrying the given usage. */
function assistantMessage(u: Usage): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic",
    provider: "anthropic",
    model: "test",
    usage: u,
    stopReason: "stop",
    timestamp: 0,
  };
}

/** An assistant message that FAILED: pi resolves the turn with stopReason "error". */
function erroredMessage(
  errorMessage: string,
  over: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "openai-codex",
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    usage: usage({}),
    stopReason: "error",
    errorMessage,
    timestamp: 0,
    ...over,
  };
}

/** A user message — has no `usage` field, like a turn that ended without one. */
const userMessage: UserMessage = { role: "user", content: "", timestamp: 0 };

/** A `turn_end` session event with the given final message. */
function turnEnd(message: AssistantMessage | UserMessage): AgentSessionEvent {
  return { type: "turn_end", message, toolResults: [] };
}

test("normalizeUsage: context_tokens = totalTokens - output; cached = cacheRead", () => {
  // input 100 + output 20 + cacheRead 300 + cacheWrite 50 = 470 totalTokens.
  // The prompt occupying the window is everything but output: 450.
  expect(
    normalizeUsage({
      input: 100,
      output: 20,
      cacheRead: 300,
      cacheWrite: 50,
      totalTokens: 470,
    }),
  ).toEqual({ context_tokens: 450, output_tokens: 20, cached_tokens: 300 });
});

test("normalizeUsage: missing/garbage usage degrades to null (no misleading zeroes)", () => {
  expect(normalizeUsage(undefined)).toBeNull();
  expect(normalizeUsage(null)).toBeNull();
  expect(normalizeUsage({})).toBeNull();
  expect(normalizeUsage({ output: 5 })).toBeNull(); // no totalTokens
});

test("normalizeUsage: clamps a degenerate output > total to zero, never negative", () => {
  expect(normalizeUsage({ output: 99, cacheRead: 0, totalTokens: 10 })).toEqual(
    {
      context_tokens: 0,
      output_tokens: 99,
      cached_tokens: 0,
    },
  );
});

test("toWire maps turn_end (with usage) to a usage frame", () => {
  expect(
    toWire(
      turnEnd(
        assistantMessage(
          usage({
            input: 100,
            output: 20,
            cacheRead: 300,
            cacheWrite: 50,
            totalTokens: 470,
          }),
        ),
      ),
    ),
  ).toEqual({
    type: "usage",
    data: { context_tokens: 450, output_tokens: 20, cached_tokens: 300 },
  });
});

test("toWire drops a turn_end whose final message has no usage", () => {
  // A user message carries no `usage` field, so there is nothing to report.
  expect(toWire(turnEnd(userMessage))).toBeNull();
});

test("toWire maps an errored turn_end to a typed provider_error frame", () => {
  // pi resolves a failed request rather than throwing — the final message comes
  // back with stopReason "error" + errorMessage. toWire classifies it.
  expect(
    toWire(
      turnEnd(
        erroredMessage(
          "OpenAI API error (401): Your session has ended. Please log in again. (app_session_terminated)",
        ),
      ),
    ),
  ).toEqual({
    type: "provider_error",
    data: {
      kind: "unauthenticated",
      provider: "openai-codex",
      cause: "token_revoked",
      message:
        "OpenAI API error (401): Your session has ended. Please log in again. (app_session_terminated)",
    },
  });
});

test("toWire does NOT emit provider_error for an aborted turn (user cancel)", () => {
  // Cancellation is not a provider failure; the cancel path handles teardown.
  const aborted = erroredMessage("Request was aborted", {
    stopReason: "aborted",
  });
  expect(toWire(turnEnd(aborted))?.type).not.toBe("provider_error");
});

test("toWire ignores an error stopReason with no errorMessage (falls back to usage)", () => {
  const noText = erroredMessage("", {
    usage: usage({ output: 5, totalTokens: 25 }),
  });
  expect(toWire(turnEnd(noText))).toEqual({
    type: "usage",
    data: { context_tokens: 20, output_tokens: 5, cached_tokens: 0 },
  });
});
