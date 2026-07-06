import {
  type CompactionResult,
  DEFAULT_COMPACTION_SETTINGS,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  boundMessages,
  droppedNotice,
  makeCompactionGuard,
  SUMMARIZER_INPUT_FRACTION,
  summarizerInputBudget,
} from "./compaction-guard";

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

const okCompaction: CompactionResult = {
  summary: "S",
  firstKeptEntryId: "e1",
  tokensBefore: 5000,
};

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

describe("boundMessages", () => {
  it("keeps the newest messages that fit, in order", () => {
    const messages = [msg(100), msg(100), msg(100), msg(100)];
    const { kept, dropped } = boundMessages(messages, 250);
    expect(kept).toEqual(messages.slice(2));
    expect(dropped).toBe(2);
  });

  it("keeps everything under budget", () => {
    const messages = [msg(100), msg(100)];
    expect(boundMessages(messages, 250)).toEqual({
      kept: messages,
      dropped: 0,
    });
  });

  it("keeps nothing when even the newest message overflows", () => {
    expect(boundMessages([msg(300)], 250)).toEqual({ kept: [], dropped: 1 });
  });
});

describe("summarizerInputBudget", () => {
  it("is the guard fraction of the window", () => {
    expect(summarizerInputBudget(272_000)).toBe(
      Math.floor(272_000 * SUMMARIZER_INPUT_FRACTION),
    );
  });
});

describe("makeCompactionGuard", () => {
  // Window 1000 → budget 700 (at the 0.7 fraction).
  it("declines when the summarizer input fits (pi's default path runs)", async () => {
    const compactFn = vi.fn(async () => okCompaction);
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const result = await handler(makeEvent([msg(300), msg(300)]), ctx);
    expect(result).toBeUndefined();
    expect(compactFn).not.toHaveBeenCalled();
  });

  it("bounds an overflowing history and prefixes the drop notice", async () => {
    const compactFn = vi.fn(async (..._args: unknown[]) => okCompaction);
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const messages = [msg(300), msg(300), msg(300)]; // 900 > 700: drops oldest
    const result = await handler(makeEvent(messages), ctx);
    expect(compactFn).toHaveBeenCalledOnce();
    const bounded = compactFn.mock.calls[0]?.[0] as unknown as {
      messagesToSummarize: Msg[];
    };
    expect(bounded.messagesToSummarize).toEqual(messages.slice(1));
    expect(result?.compaction?.summary).toBe(`${droppedNotice(1)}\n\nS`);
    expect(result?.compaction?.firstKeptEntryId).toBe("e1");
  });

  it("compacts deterministically when not even the newest message fits", async () => {
    const compactFn = vi.fn(async () => okCompaction);
    const handler = loadHandler(compactFn);
    const { ctx, getApiKeyAndHeaders } = makeCtx({ contextWindow: 1000 });
    const result = await handler(
      makeEvent([msg(800)], { previousSummary: "PREV" }),
      ctx,
    );
    expect(compactFn).not.toHaveBeenCalled();
    expect(getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(result?.compaction?.summary).toBe(`PREV\n\n${droppedNotice(1)}`);
    expect(result?.compaction?.firstKeptEntryId).toBe("e1");
    expect(result?.compaction?.tokensBefore).toBe(5000);
  });

  it("declines when the bounded summarization itself fails (retried next turn)", async () => {
    const compactFn = vi.fn(async () => {
      throw new Error("rate limited");
    });
    const handler = loadHandler(compactFn);
    const { ctx } = makeCtx({ contextWindow: 1000 });
    const result = await handler(
      makeEvent([msg(300), msg(300), msg(300)]),
      ctx,
    );
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
    const bounded = compactFn.mock.calls[0]?.[0] as unknown as {
      messagesToSummarize: Msg[];
      turnPrefixMessages: Msg[];
    };
    expect(bounded.messagesToSummarize).toHaveLength(1);
    expect(bounded.turnPrefixMessages).toEqual(prefix.slice(1));
    expect(result?.compaction?.summary).toBe(`${droppedNotice(1)}\n\nS`);
  });
});
