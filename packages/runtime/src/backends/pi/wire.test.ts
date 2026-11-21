import type {
  AssistantMessage,
  Usage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { resetCodexRefusalMemory } from "../../ai/codex-terse-refusal";
import {
  authFailureActive,
  resetAuthFailures,
} from "../../auth/credential-health";
import { reportRevokedServedToken } from "../../auth/report-revoked";
import {
  newUsedTokenCapture,
  runWithUsedTokenCapture,
} from "../../auth/used-token";
import { createWireTranslator, normalizeUsage, toWire } from "./wire";

vi.mock("../../auth/report-revoked", () => ({
  reportRevokedServedToken: vi.fn(),
}));

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

const userMessage: UserMessage = { role: "user", content: "", timestamp: 0 };

function turnEnd(message: AssistantMessage | UserMessage): AgentSessionEvent {
  return { type: "turn_end", message, toolResults: [] };
}

test("normalizeUsage: context_tokens = totalTokens - output; cached = cacheRead", () => {
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
  expect(normalizeUsage({ output: 5 })).toBeNull();
  expect(normalizeUsage({ output: 5, totalTokens: "x" })).toBeNull();
});

test("normalizeUsage: no totalTokens → synthesizes context from the components", () => {
  expect(
    normalizeUsage({ input: 100, output: 20, cacheRead: 300, cacheWrite: 50 }),
  ).toEqual({ context_tokens: 450, output_tokens: 20, cached_tokens: 300 });
  expect(normalizeUsage({ input: 5000, output: 100 })).toEqual({
    context_tokens: 5000,
    output_tokens: 100,
    cached_tokens: 0,
  });
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
  expect(toWire(turnEnd(userMessage))).toBeNull();
});

test("toWire maps an errored turn_end to a typed provider_error frame", () => {
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

test("toWire reports an auth failure under the digest of the token the TURN ran on (PRODUCT-1319)", () => {
  vi.mocked(reportRevokedServedToken).mockClear();
  const capture = newUsedTokenCapture();
  capture.record("openai-codex", "the-token-that-401d");
  runWithUsedTokenCapture(capture, () => {
    toWire(
      turnEnd(
        failedAssistantMessage(
          "error",
          "OpenAI API error (401): Your session has ended. Please log in again. (app_session_terminated)",
          { provider: "openai-codex", model: "gpt-5.1-codex" },
        ),
      ),
    );
  });
  expect(reportRevokedServedToken).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ kind: "unauthenticated" }),
    capture.digestFor("openai-codex"),
  );

  vi.mocked(reportRevokedServedToken).mockClear();
  toWire(
    turnEnd(
      failedAssistantMessage(
        "error",
        "OpenAI API error (401): Your session has ended. Please log in again. (app_session_terminated)",
        { provider: "openai-codex", model: "gpt-5.1-codex" },
      ),
    ),
  );
  expect(reportRevokedServedToken).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ kind: "unauthenticated" }),
    undefined,
  );
  resetAuthFailures();
});

test("toWire marks raw openai auth failures against openai-codex", () => {
  resetAuthFailures();
  toWire(
    turnEnd(
      failedAssistantMessage("error", "401 Unauthorized: token expired", {
        provider: "openai",
        model: "gpt-5.1-codex",
      }),
    ),
  );

  expect(authFailureActive("openai-codex")).toBe(true);
  expect(authFailureActive("openai")).toBe(false);
  resetAuthFailures();
});

test("toWire surfaces a pi-internal turn error (the Copilot no-response bug) as a typed provider_error", () => {
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

test("toWire carries a successful start_mission receipt without parsing its text", () => {
  const ev = {
    type: "tool_execution_end",
    toolCallId: "t1",
    toolName: "start_mission",
    result: {
      content: [{ type: "text", text: "An unrelated reply" }],
      details: { ok: true, id: "m1", title: "Research", agent: "Ada" },
    },
    isError: false,
  } as unknown as AgentSessionEvent;
  expect(toWire(ev)).toMatchObject({
    type: "tool_end",
    data: { mission: { id: "m1", title: "Research", agent: "Ada" } },
  });
  expect(
    toWire({ ...ev, isError: true } as AgentSessionEvent),
  ).not.toHaveProperty("data.mission");
});

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
  expect(translate(textDelta("turn two"))).toEqual({
    type: "text",
    data: "turn two",
  });
});

const agentSettled = () =>
  ({ type: "agent_settled" }) as unknown as AgentSessionEvent;

const overflowTurnEnd = () =>
  turnEnd(
    failedAssistantMessage(
      "error",
      "Your input exceeds the context window of this model.",
      { provider: "openai-codex", model: "gpt-5.5" },
    ),
  );

test("translator suppresses an errored turn_end that pi recovers from (HOU-1057)", () => {
  const translate = createWireTranslator();
  expect(translate(overflowTurnEnd())).toBeNull();
  translate(agentStart());
  expect(
    translate(
      turnEnd(assistantMessage(usage({ totalTokens: 50, output: 10 }))),
    ),
  ).toEqual({
    type: "usage",
    data: { context_tokens: 40, output_tokens: 10, cached_tokens: 0 },
  });
  expect(translate(agentSettled())).toBeNull();
});

test("translator flushes the held error at agent_settled when recovery never happened", () => {
  const translate = createWireTranslator();
  expect(translate(overflowTurnEnd())).toBeNull();
  const flushed = translate(agentSettled());
  expect(flushed?.type).toBe("provider_error");
  expect(flushed && "data" in flushed && flushed.data).toMatchObject({
    kind: "context_overflow",
    provider: "openai-codex",
  });
  expect(translate(agentSettled())).toBeNull();
});

test("translator keeps the NEWEST failure when a retry fails again", () => {
  const translate = createWireTranslator();
  expect(translate(overflowTurnEnd())).toBeNull();
  translate(agentStart());
  expect(
    translate(
      turnEnd(
        failedAssistantMessage("error", "401 Unauthorized: token expired", {
          provider: "openai-codex",
          model: "gpt-5.5",
        }),
      ),
    ),
  ).toBeNull();
  const flushed = translate(agentSettled());
  expect(flushed && "data" in flushed && flushed.data).toMatchObject({
    kind: "unauthenticated",
  });
});

test("translator does NOT treat an aborted turn as recovery — the error still flushes", () => {
  const translate = createWireTranslator();
  expect(translate(overflowTurnEnd())).toBeNull();
  translate(agentStart());
  translate(
    turnEnd(
      failedAssistantMessage("aborted", undefined, {
        usage: usage({ totalTokens: 10, output: 2 }),
      }),
    ),
  );
  const flushed = translate(agentSettled());
  expect(flushed?.type).toBe("provider_error");
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

const TERSE = '{"detail":"Bad Request"}';

const terseTurnEnd = (model: string) =>
  turnEnd(
    failedAssistantMessage("error", TERSE, { provider: "openai-codex", model }),
  );

const autoRetryStart = (errorMessage: string): AgentSessionEvent => ({
  type: "auto_retry_start",
  attempt: 1,
  maxAttempts: 3,
  delayMs: 2000,
  errorMessage,
});

test("translator reads a terse final attempt from the retry attempt that explained it (PRODUCT-1832)", () => {
  resetCodexRefusalMemory();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const translate = createWireTranslator();
  translate(agentStart());
  translate(
    autoRetryStart(
      "You have hit your ChatGPT usage limit (plus plan). Try again in ~7524 min.",
    ),
  );
  expect(translate(terseTurnEnd("gpt-6-astra"))).toBeNull();
  const flushed = translate(agentSettled());
  expect(flushed && "data" in flushed && flushed.data).toMatchObject({
    kind: "quota_exhausted",
    provider: "openai-codex",
    model: "gpt-6-astra",
  });
  expect(error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("kind=quota_exhausted ::"),
  );
  vi.restoreAllMocks();
  resetAuthFailures();
  resetCodexRefusalMemory();
});

test("toWire reads a terse refusal from the plan gate the same model hit a turn earlier", () => {
  resetCodexRefusalMemory();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  toWire(
    turnEnd(
      failedAssistantMessage(
        "error",
        '{"detail":"The \'gpt-5.4-mini\' model is not supported when using Codex with a ChatGPT account."}',
        { provider: "openai-codex", model: "gpt-5.4-mini" },
      ),
    ),
  );
  expect(toWire(terseTurnEnd("gpt-5.4-mini"))).toMatchObject({
    type: "provider_error",
    data: {
      kind: "model_unavailable",
      model: "gpt-5.4-mini",
      suggested_fallback: "gpt-6-luna",
    },
  });
  expect(error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks();
  resetCodexRefusalMemory();
});

test("a terse refusal nothing can explain stays unknown on the card but logs as a warning", () => {
  resetCodexRefusalMemory();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(toWire(terseTurnEnd("gpt-5.5"))).toMatchObject({
    type: "provider_error",
    data: { kind: "unknown", provider: "openai-codex", raw_excerpt: TERSE },
  });
  expect(error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining(`kind=unknown :: ${TERSE}`),
  );
  vi.restoreAllMocks();
});

test("translator forgets a retry attempt's text once the turn ends or a new prompt starts", () => {
  resetCodexRefusalMemory();
  resetAuthFailures();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const translate = createWireTranslator();
  translate(
    autoRetryStart(
      "You have hit your ChatGPT usage limit (plus plan). Try again in ~10 min.",
    ),
  );
  translate(turnEnd(assistantMessage(usage({ totalTokens: 5, output: 1 }))));
  translate(agentSettled());
  translate(agentStart());
  expect(translate(terseTurnEnd("gpt-6-astra"))).toBeNull();
  const flushed = translate(agentSettled());
  expect(flushed && "data" in flushed && flushed.data).toMatchObject({
    kind: "unknown",
  });
  vi.restoreAllMocks();
  resetCodexRefusalMemory();
});

test("toWire marks an operation the tool reports as not done as an error", () => {
  const ended = (details: unknown) =>
    toWire({
      type: "tool_execution_end",
      toolCallId: "t1",
      toolName: "houston_call",
      result: {
        content: [{ type: "text", text: "ERROR gateway_error: name taken" }],
        details,
      },
      isError: false,
    } as unknown as AgentSessionEvent);
  expect(ended({ ok: false, operation: "createAgent" })).toMatchObject({
    data: { isError: true },
  });
  expect(ended({ ok: true, operation: "createAgent" })).toMatchObject({
    data: { isError: false },
  });
});
