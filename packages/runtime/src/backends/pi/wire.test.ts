import type {
  AssistantMessage,
  Usage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { createWireTranslator, normalizeUsage, toWire } from "./wire";

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
 * An assistant message that ended in failure — pi's shape: a model/provider error
 * (or the user's abort) is caught internally and delivered as the final message
 * with stopReason "error"/"aborted" and the reason in `errorMessage`, NOT thrown
 * from prompt(). `over` sets provider/model/usage for a specific provider's shape.
 */
function failedAssistantMessage(
  stopReason: "error" | "aborted",
  errorMessage: string | undefined,
  over: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic",
    provider: "anthropic",
    model: "test",
    usage: usage({}),
    stopReason,
    ...(errorMessage !== undefined ? { errorMessage } : {}),
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
  // Output alone carries no context signal, and there is no totalTokens to derive
  // one from → null rather than a misleading empty context.
  expect(normalizeUsage({ output: 5 })).toBeNull();
  expect(normalizeUsage({ output: 5, totalTokens: "x" })).toBeNull();
});

test("normalizeUsage: no totalTokens → synthesizes context from the components", () => {
  // The Gemini-through-pi case: components present, but pi never summed them.
  // context_tokens = input + cacheRead + cacheWrite (everything but output).
  expect(
    normalizeUsage({ input: 100, output: 20, cacheRead: 300, cacheWrite: 50 }),
  ).toEqual({ context_tokens: 450, output_tokens: 20, cached_tokens: 300 });
  // Input only (no cache, no total): context is the input.
  expect(normalizeUsage({ input: 5000, output: 100 })).toEqual({
    context_tokens: 5000,
    output_tokens: 100,
    cached_tokens: 0,
  });
  // A lone cacheRead is a valid context signal on its own.
  expect(normalizeUsage({ cacheRead: 200 })).toEqual({
    context_tokens: 200,
    output_tokens: 0,
    cached_tokens: 200,
  });
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
        failedAssistantMessage(
          "error",
          "OpenAI API error (401): Your session has ended. Please log in again. (app_session_terminated)",
          { provider: "openai-codex", model: "gpt-5.1-codex" },
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

test("toWire surfaces a pi-internal turn error (the Copilot no-response bug) as a typed provider_error", () => {
  // The regression that made Copilot look dead: pi catches a model/provider
  // failure (an expired/rejected token, a rate limit, a 4xx) and delivers it here
  // instead of throwing. Dropping it left the turn an empty, silent success ("no
  // response, no error"). The reason MUST reach the user — now as a typed card.
  expect(
    toWire(
      turnEnd(
        failedAssistantMessage(
          "error",
          "401 Unauthorized: Copilot token expired",
          { provider: "github-copilot", model: "claude-opus-4.8" },
        ),
      ),
    ),
  ).toEqual({
    type: "provider_error",
    data: {
      kind: "unauthenticated",
      provider: "github-copilot",
      cause: "token_expired",
      message: "401 Unauthorized: Copilot token expired",
    },
  });
});

test("toWire does NOT surface an aborted turn (the user's Stop) as a provider_error", () => {
  // Pressing Stop aborts the session -> pi emits an aborted failure message.
  // cancelTurn already published "Stopped by user", so surfacing this too would
  // double-report the stop. It falls through to the usage path, never an error.
  expect(
    toWire(
      turnEnd(
        failedAssistantMessage("aborted", "Request aborted by user", {
          usage: usage({ totalTokens: 10, output: 4 }),
        }),
      ),
    ),
  ).toEqual({
    type: "usage",
    data: { context_tokens: 6, output_tokens: 4, cached_tokens: 0 },
  });
});

test("toWire ignores a stopReason 'error' with no errorMessage (falls back to usage)", () => {
  // Defensive: only surface when there is an actual reason to show; otherwise
  // fall through to usage so the turn still settles rather than emitting a blank.
  expect(
    toWire(
      turnEnd(
        failedAssistantMessage("error", undefined, {
          usage: usage({ totalTokens: 25, output: 5 }),
        }),
      ),
    ),
  ).toEqual({
    type: "usage",
    data: { context_tokens: 20, output_tokens: 5, cached_tokens: 0 },
  });
});

test("toWire carries a tool_execution_end's result text, clipped (HOU-717)", () => {
  const ev = {
    type: "tool_execution_end",
    toolCallId: "t1",
    toolName: "bash",
    result: {
      content: [
        { type: "text", text: "file-a.ts" },
        { type: "image", data: "…" },
        { type: "text", text: "file-b.ts" },
      ],
      details: {},
    },
    isError: false,
  } as unknown as AgentSessionEvent;
  expect(toWire(ev)).toEqual({
    type: "tool_end",
    data: { name: "bash", isError: false, content: "file-a.ts\nfile-b.ts" },
  });
});

test("toWire omits tool_end content for a text-less or malformed result", () => {
  const bare = {
    type: "tool_execution_end",
    toolCallId: "t1",
    toolName: "bash",
    result: null,
    isError: true,
  } as unknown as AgentSessionEvent;
  expect(toWire(bare)).toEqual({
    type: "tool_end",
    data: { name: "bash", isError: true },
  });
});

// --- createWireTranslator: block-boundary separators (HOU-857) ---------------

/** A `message_update` session event carrying the given assistant-message event. */
function msgUpdate(assistantMessageEvent: unknown): AgentSessionEvent {
  return {
    type: "message_update",
    message: assistantMessage(usage({})),
    assistantMessageEvent,
  } as unknown as AgentSessionEvent;
}
const textStart = () => msgUpdate({ type: "text_start", contentIndex: 0 });
const textDelta = (delta: string) =>
  msgUpdate({ type: "text_delta", contentIndex: 0, delta });
const thinkingStart = () =>
  msgUpdate({ type: "thinking_start", contentIndex: 0 });
const thinkingDelta = (delta: string) =>
  msgUpdate({ type: "thinking_delta", contentIndex: 0, delta });
const agentStart = () =>
  ({ type: "agent_start" }) as unknown as AgentSessionEvent;

test("translator inserts a paragraph break between a turn's text blocks (HOU-857)", () => {
  // The screenshot bug: text → tool call → text streamed as two blocks, but the
  // bare deltas concatenate downstream into "…for you now.Go ahead…". The
  // second block's FIRST delta must carry the separator.
  const translate = createWireTranslator();
  expect(translate(textStart())).toBeNull();
  expect(translate(textDelta("I'll get that set up for you now."))).toEqual({
    type: "text",
    data: "I'll get that set up for you now.",
  });
  translate({
    type: "tool_execution_start",
    toolCallId: "t1",
    toolName: "connect",
    args: {},
  } as unknown as AgentSessionEvent);
  expect(translate(textStart())).toBeNull();
  expect(translate(textDelta("Go ahead and sign in."))).toEqual({
    type: "text",
    data: "\n\nGo ahead and sign in.",
  });
  // Later deltas of the SAME block stream unprefixed.
  expect(translate(textDelta(" Once connected, I'll confirm."))).toEqual({
    type: "text",
    data: " Once connected, I'll confirm.",
  });
});

test("translator never prefixes the turn's first text block — even after thinking", () => {
  const translate = createWireTranslator();
  expect(translate(thinkingStart())).toBeNull();
  expect(translate(thinkingDelta("hmm"))).toEqual({
    type: "thinking",
    data: "hmm",
  });
  // First TEXT block: thinking streamed already, but text starts fresh.
  expect(translate(textStart())).toBeNull();
  expect(translate(textDelta("Hello"))).toEqual({
    type: "text",
    data: "Hello",
  });
});

test("translator separates thinking blocks independently of text blocks", () => {
  const translate = createWireTranslator();
  translate(thinkingStart());
  expect(translate(thinkingDelta("first block"))).toEqual({
    type: "thinking",
    data: "first block",
  });
  translate(thinkingStart());
  expect(translate(thinkingDelta("second block"))).toEqual({
    type: "thinking",
    data: "\n\nsecond block",
  });
});

test("translator resets its block state on agent_start (a new turn starts fresh)", () => {
  const translate = createWireTranslator();
  translate(textStart());
  translate(textDelta("turn one"));
  translate(agentStart());
  translate(textStart());
  // A long-lived subscriber crossing into the next turn: no leaked separator.
  expect(translate(textDelta("turn two"))).toEqual({
    type: "text",
    data: "turn two",
  });
});

test("toWire clips an oversized tool result to the preview cap", () => {
  const ev = {
    type: "tool_execution_end",
    toolCallId: "t1",
    toolName: "read",
    result: { content: [{ type: "text", text: "x".repeat(10_000) }] },
    isError: false,
  } as unknown as AgentSessionEvent;
  const wire = toWire(ev) as Extract<
    NonNullable<ReturnType<typeof toWire>>,
    { type: "tool_end" }
  >;
  expect(wire.data.content?.length).toBeLessThan(4_100);
  expect(wire.data.content?.endsWith("… (truncated)")).toBe(true);
});
