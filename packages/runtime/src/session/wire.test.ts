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

/**
 * An assistant message that ended in failure — pi's `handleRunFailure` shape: a
 * model/provider error (or the user's abort) is caught internally and delivered
 * as the final message with stopReason "error"/"aborted" and the reason in
 * `errorMessage`, NOT thrown from prompt().
 */
function failedAssistantMessage(
  stopReason: "error" | "aborted",
  errorMessage: string | undefined,
  u: Usage = usage({}),
): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic",
    provider: "anthropic",
    model: "test",
    usage: u,
    stopReason,
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    timestamp: 0,
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

test("toWire surfaces a stopReason 'error' turn_end as an error frame (the real failure reason)", () => {
  // The regression that made Copilot look dead: pi catches a model/provider
  // failure (an expired/rejected token, a rate limit, a 4xx) and delivers it
  // here instead of throwing. Dropping it left the turn an empty, silent
  // success ("no response, no error"). The reason MUST reach the user.
  expect(
    toWire(
      turnEnd(
        failedAssistantMessage(
          "error",
          "401 Unauthorized: Copilot token expired",
        ),
      ),
    ),
  ).toEqual({
    type: "error",
    data: { message: "401 Unauthorized: Copilot token expired" },
  });
});

test("toWire does NOT surface an 'aborted' turn_end as an error (the user's Stop)", () => {
  // Pressing Stop aborts the session -> pi emits an aborted failure message with
  // errorMessage "Request aborted by user". cancelTurn already published
  // "Stopped by user", so surfacing this too would double-report the stop as a
  // red error. It falls through to the usage path, never an error frame.
  expect(
    toWire(
      turnEnd(
        failedAssistantMessage(
          "aborted",
          "Request aborted by user",
          usage({ totalTokens: 10, output: 4 }),
        ),
      ),
    ),
  ).toEqual({
    type: "usage",
    data: { context_tokens: 6, output_tokens: 4, cached_tokens: 0 },
  });
});

test("toWire ignores a stopReason 'error' with no errorMessage (no empty error frame)", () => {
  // Defensive: only surface when there is an actual reason to show; otherwise
  // fall through to usage so the turn still settles rather than emitting a blank.
  expect(
    toWire(
      turnEnd(
        failedAssistantMessage(
          "error",
          undefined,
          usage({ totalTokens: 8, output: 3 }),
        ),
      ),
    ),
  ).toEqual({
    type: "usage",
    data: { context_tokens: 5, output_tokens: 3, cached_tokens: 0 },
  });
});
