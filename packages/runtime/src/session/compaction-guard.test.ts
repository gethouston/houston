import {
  type CompactionResult,
  convertToLlm,
  DEFAULT_COMPACTION_SETTINGS,
  type ExtensionAPI,
  type ExtensionContext,
  estimateTokens,
  type SessionBeforeCompactEvent,
  serializeConversation,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  droppedNotice,
  MAX_BOUNDED_ATTEMPTS,
  makeCompactionGuard,
} from "./compaction-guard";
import {
  boundMessages,
  elideMiddle,
  isInputSizeRejection,
  SUMMARIZER_INPUT_FRACTION,
  SUMMARIZER_INPUT_MAX_TOKENS,
  summarizerInputBudget,
} from "./summarizer-budget";

type Msg =
  SessionBeforeCompactEvent["preparation"]["messagesToSummarize"][number];
type Handler = (
  event: SessionBeforeCompactEvent,
  ctx: ExtensionContext,
) => Promise<{ compaction?: CompactionResult } | undefined>;

/** A user message estimating to exactly `tokens` (pi's chars/4 heuristic). */
const msg = (tokens: number): Msg =>
  ({
    role: "user",
    content: "x".repeat(tokens * 4),
    timestamp: 1,
  }) as unknown as Msg;

/** A user message with NO elidable text (image-only) at ~1200 tokens. */
const imageMsg = (): Msg =>
  ({
    role: "user",
    content: [{ type: "image", data: "", mimeType: "image/png" }],
    timestamp: 1,
  }) as unknown as Msg;

const okCompaction: CompactionResult = {
  summary: "S",
  firstKeptEntryId: "e1",
  tokensBefore: 5000,
};

const CODEX_WINDOW_REJECTION =
  "Summarization failed: Codex error: Your input exceeds the context window of this model. Please adjust your input and try again.";

function loadHandler(compactFn: Parameters<typeof makeCompactionGuard>[0]) {
  let handler: Handler | undefined;
  const pi = {
    on: (_name: string, h: unknown) => {
      handler = h as Handler;
    },
  } as unknown as ExtensionAPI;
  makeCompactionGuard(compactFn)(pi);
  if (!handler) throw new Error("session_before_compact never registered");
  return handler;
}

function makeCtx(opts: {
  contextWindow?: number;
  auth?: { ok: boolean; apiKey?: string };
}) {
  const getApiKeyAndHeaders = vi.fn(
    async () => opts.auth ?? { ok: true, apiKey: "key", headers: {} },
  );
  const ctx = {
    model:
      opts.contextWindow === undefined
        ? undefined
        : { contextWindow: opts.contextWindow },
    modelRegistry: { getApiKeyAndHeaders },
  } as unknown as ExtensionContext;
  return { ctx, getApiKeyAndHeaders };
}

function makeEvent(
  messages: Msg[],
  opts: { prefix?: Msg[]; previousSummary?: string } = {},
): SessionBeforeCompactEvent {
  return {
    type: "session_before_compact",
    preparation: {
      firstKeptEntryId: "e1",
      messagesToSummarize: messages,
      turnPrefixMessages: opts.prefix ?? [],
      isSplitTurn: false,
      tokensBefore: 5000,
      previousSummary: opts.previousSummary,
      fileOps: { read: new Set(), written: new Set(), edited: new Set() },
      settings: DEFAULT_COMPACTION_SETTINGS,
    },
    branchEntries: [],
    reason: "threshold",
    willRetry: false,
    signal: new AbortController().signal,
  } as unknown as SessionBeforeCompactEvent;
}

function boundedArg(compactFn: ReturnType<typeof vi.fn>, call = 0) {
  return compactFn.mock.calls[call]?.[0] as unknown as {
    messagesToSummarize: Msg[];
    turnPrefixMessages: Msg[];
  };
}

describe("boundMessages", () => {
  it("keeps the newest messages that fit, in order", () => {
    const messages = [msg(100), msg(100), msg(100), msg(100)];
    const { kept, dropped, elided } = boundMessages(messages, 250);
    expect(kept).toEqual(messages.slice(2));
    expect(dropped).toBe(2);
    expect(elided).toBe(0);
  });

  it("keeps everything under budget", () => {
    const messages = [msg(100), msg(100)];
    expect(boundMessages(messages, 250)).toEqual({
      kept: messages,
      dropped: 0,
      elided: 0,
    });
  });

  it("elides the middle of an oversized newest message instead of dropping it", () => {
    const giant = msg(300);
    const { kept, dropped, elided } = boundMessages([msg(50), giant], 250);
    expect(dropped).toBe(1);
    expect(elided).toBe(1);
    expect(kept).toHaveLength(1);
    const keptContent = (kept[0] as unknown as { content: string }).content;
    expect(keptContent).toContain("characters elided");
    expect(keptContent.startsWith("xx")).toBe(true);
    expect(keptContent.endsWith("xx")).toBe(true);
    expect(estimateTokens(kept[0] as never)).toBeLessThanOrEqual(250);
    // The original message is never mutated.
    expect((giant as unknown as { content: string }).content).toBe(
      "x".repeat(1200),
    );
  });

  it("drops an oversized newest message with no elidable text", () => {
    expect(boundMessages([imageMsg()], 250)).toEqual({
      kept: [],
      dropped: 1,
      elided: 0,
    });
  });
});

describe("elideMiddle", () => {
  it("keeps head and tail around an explicit marker, within the cap", () => {
    const out = elideMiddle(`HEAD${"m".repeat(500)}TAIL`, 120);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out).toContain("characters elided");
    expect(out.startsWith("HEAD")).toBe(true);
    expect(out.endsWith("TAIL")).toBe(true);
  });

  it("returns short text untouched", () => {
    expect(elideMiddle("short", 120)).toBe("short");
  });
});

describe("summarizerInputBudget", () => {
  it("is the guard fraction of the window", () => {
    expect(summarizerInputBudget(272_000)).toBe(
      Math.floor(272_000 * SUMMARIZER_INPUT_FRACTION),
    );
  });

  it("never exceeds the provider-string-cap ceiling, however big the window", () => {
    expect(summarizerInputBudget(100_000_000)).toBe(
      SUMMARIZER_INPUT_MAX_TOKENS,
    );
    // The ceiling, serialized at 4 chars/token, stays under OpenAI's
    // 10,485,760-char per-string cap with room for prompt scaffolding.
    expect(SUMMARIZER_INPUT_MAX_TOKENS * 4).toBeLessThan(10_485_760);
  });
});

describe("isInputSizeRejection", () => {
  it("recognizes size rejections", () => {
    expect(isInputSizeRejection(CODEX_WINDOW_REJECTION)).toBe(true);
    expect(
      isInputSizeRejection(
        "Summarization failed: Invalid 'input[0].content[0].text': string too long. Expected a string with maximum length 10485760, but got a string with length 31056249 instead.",
      ),
    ).toBe(true);
    expect(isInputSizeRejection("400 context_length_exceeded")).toBe(true);
  });

  it("leaves transient failures on the defer path", () => {
    expect(isInputSizeRejection("rate limited")).toBe(false);
    expect(
      isInputSizeRejection(
        "Throttling error: Too many tokens, please wait before trying again.",
      ),
    ).toBe(false);
    expect(isInputSizeRejection("socket hang up")).toBe(false);
  });
});

describe("makeCompactionGuard", () => {
  // Window 1000 → budget 700 (at the 0.7 fraction).
  it("declines when the summarizer input fits (pi's default path runs on the untouched preparation)", async () => {
    const compactFn = vi.fn(async () => okCompaction);
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const messages = [msg(300), msg(300)];
    const event = makeEvent(messages);
    const result = await handler(event, ctx);
    expect(result).toBeUndefined();
    expect(compactFn).not.toHaveBeenCalled();
    // Byte-identical pass-through: same message objects, untouched content.
    expect(event.preparation.messagesToSummarize[0]).toBe(messages[0]);
    expect((messages[0] as unknown as { content: string }).content).toBe(
      "x".repeat(1200),
    );
  });

  it("bounds an overflowing history under the budget and prefixes the drop notice", async () => {
    const compactFn = vi.fn(async (..._args: unknown[]) => okCompaction);
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const messages = [msg(300), msg(300), msg(300)]; // 900 > 700: drops oldest
    const result = await handler(makeEvent(messages), ctx);
    expect(compactFn).toHaveBeenCalledOnce();
    const bounded = boundedArg(compactFn);
    expect(bounded.messagesToSummarize).toEqual(messages.slice(1));
    const totalTokens = bounded.messagesToSummarize.reduce(
      (sum, m) => sum + estimateTokens(m as never),
      0,
    );
    expect(totalTokens).toBeLessThanOrEqual(700);
    expect(result?.compaction?.summary).toBe(`${droppedNotice(1)}\n\nS`);
    expect(result?.compaction?.firstKeptEntryId).toBe("e1");
  });

  it("halves the budget and retries when the provider rejects the bounded request for size", async () => {
    const compactFn = vi
      .fn(async (..._args: unknown[]) => okCompaction)
      .mockRejectedValueOnce(new Error(CODEX_WINDOW_REJECTION));
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const messages = [msg(300), msg(300), msg(300)];
    const result = await handler(makeEvent(messages), ctx);
    expect(compactFn).toHaveBeenCalledTimes(2);
    // First attempt at budget 700 keeps 2 messages; the halved retry (350)
    // keeps only the newest.
    expect(boundedArg(compactFn, 0).messagesToSummarize).toHaveLength(2);
    expect(boundedArg(compactFn, 1).messagesToSummarize).toHaveLength(1);
    expect(result?.compaction?.summary).toBe(`${droppedNotice(2)}\n\nS`);
  });

  it("compacts deterministically when every halved attempt is size-rejected (never defers into pi's unbounded default)", async () => {
    const compactFn = vi.fn(async () => {
      throw new Error(CODEX_WINDOW_REJECTION);
    });
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const messages = [msg(300), msg(300), msg(300)];
    const result = await handler(
      makeEvent(messages, { previousSummary: "PREV" }),
      ctx,
    );
    expect(compactFn).toHaveBeenCalledTimes(MAX_BOUNDED_ATTEMPTS);
    expect(result?.compaction?.summary).toBe(`PREV\n\n${droppedNotice(3)}`);
    expect(result?.compaction?.firstKeptEntryId).toBe("e1");
    expect(result?.compaction?.tokensBefore).toBe(5000);
  });

  it("compacts deterministically when nothing summarizable fits (no elidable text)", async () => {
    const compactFn = vi.fn(async () => okCompaction);
    const handler = loadHandler(compactFn);
    const { ctx, getApiKeyAndHeaders } = makeCtx({ contextWindow: 1000 });
    const result = await handler(
      makeEvent([imageMsg()], { previousSummary: "PREV" }),
      ctx,
    );
    expect(compactFn).not.toHaveBeenCalled();
    expect(getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(result?.compaction?.summary).toBe(`PREV\n\n${droppedNotice(1)}`);
    expect(result?.compaction?.firstKeptEntryId).toBe("e1");
    expect(result?.compaction?.tokensBefore).toBe(5000);
  });

  it("declines when the bounded summarization fails transiently (retried next turn)", async () => {
    const compactFn = vi.fn(async () => {
      throw new Error("rate limited");
    });
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const result = await handler(
      makeEvent([msg(300), msg(300), msg(300)]),
      ctx,
    );
    expect(compactFn).toHaveBeenCalledOnce();
    expect(result).toBeUndefined();
  });

  it("declines without a model, a sane window, or auth", async () => {
    const compactFn = vi.fn(async () => okCompaction);
    const handler = loadHandler(compactFn);
    const over = [msg(300), msg(300), msg(300)];

    const noModel = makeCtx({});
    expect(await handler(makeEvent(over), noModel.ctx)).toBeUndefined();

    const zeroWindow = makeCtx({ contextWindow: 0 });
    expect(await handler(makeEvent(over), zeroWindow.ctx)).toBeUndefined();

    const noAuth = makeCtx({ contextWindow: 1000, auth: { ok: false } });
    expect(await handler(makeEvent(over), noAuth.ctx)).toBeUndefined();
    expect(compactFn).not.toHaveBeenCalled();
  });

  it("bounds the turn-prefix request separately from the history request", async () => {
    const compactFn = vi.fn(async (..._args: unknown[]) => okCompaction);
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const prefix = [msg(300), msg(300), msg(300)]; // 900 > 700: drops oldest
    const result = await handler(makeEvent([msg(300)], { prefix }), ctx);
    expect(compactFn).toHaveBeenCalledOnce();
    const bounded = boundedArg(compactFn);
    expect(bounded.messagesToSummarize).toHaveLength(1);
    expect(bounded.turnPrefixMessages).toEqual(prefix.slice(1));
    expect(result?.compaction?.summary).toBe(`${droppedNotice(1)}\n\nS`);
  });

  it("keeps the serialized request under OpenAI's 10 MiB string cap at any window", async () => {
    const compactFn = vi.fn(async (..._args: unknown[]) => okCompaction);
    const handler = loadHandler(compactFn);
    // A window so large the 0.7 fraction alone would allow a >10 MiB string;
    // the SUMMARIZER_INPUT_MAX_TOKENS ceiling must bind instead.
    const { ctx } = makeCtx({ contextWindow: 100_000_000 });
    // A 40MB conversation, like the 31MB one behind PRODUCT-1394.
    const messages = Array.from({ length: 40 }, () => msg(250_000));
    await handler(makeEvent(messages), ctx);
    expect(compactFn).toHaveBeenCalledOnce();
    const bounded = boundedArg(compactFn);
    const serialized = serializeConversation(
      convertToLlm(bounded.messagesToSummarize as never[]),
    );
    expect(serialized.length).toBeGreaterThan(0);
    expect(serialized.length).toBeLessThan(10_485_760);
  });

  it("sends an elided single giant message instead of losing all history", async () => {
    const compactFn = vi.fn(async (..._args: unknown[]) => okCompaction);
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const result = await handler(makeEvent([msg(5000)]), ctx);
    expect(compactFn).toHaveBeenCalledOnce();
    const bounded = boundedArg(compactFn);
    expect(bounded.messagesToSummarize).toHaveLength(1);
    const kept = bounded.messagesToSummarize[0] as unknown as {
      content: string;
    };
    expect(kept.content).toContain("characters elided");
    expect(
      estimateTokens(bounded.messagesToSummarize[0] as never),
    ).toBeLessThanOrEqual(700);
    expect(result?.compaction?.summary).toBe(`${droppedNotice(0, 1)}\n\nS`);
  });
});
