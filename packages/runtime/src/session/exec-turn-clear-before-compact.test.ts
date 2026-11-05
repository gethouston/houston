import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

/**
 * The standing server decides to compact on the fill the next request sends.
 * On Claude that is the fill after the transcript's stale tool results are
 * cleared, which happens between turns, so the clearing runs first.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-clr-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-clr-ws-"),
);

vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    activeEffort: () => undefined,
    resolveModel: () => ({
      provider: "anthropic",
      id: "claude-test",
      contextWindow: 200_000,
      reasoning: false,
    }),
  };
});
vi.mock("./conversation-cache", () => ({
  switchBackendIfNeeded: vi.fn(async () => ({
    rebuilt: false,
    preTokens: null,
  })),
  switchModeIfNeeded: vi.fn(async () => ({ rebuilt: false })),
  conversations: { peek: () => undefined, delete: () => false },
}));
vi.mock("../store/conversations", () => ({
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  getHistory: vi.fn(() => ({ messages: [] })),
  consumeSessionReplay: vi.fn(() => false),
}));

const { execTurn } = await import("./exec-turn");

type Conv = Parameters<typeof execTurn>[0];

function claudeConv(fill: number, staleTokens: number) {
  let tokens = fill;
  const compact = vi.fn(async (): Promise<undefined> => undefined);
  const session = {
    subscribe: (listener: (e: WireEvent) => void) => {
      void listener;
      return () => {};
    },
    prompt: async () => {},
    abort: async () => {},
    dispose: () => {},
    setModel: async () => {},
    compact,
    setThinkingLevel: () => {},
    getContextUsage: () => ({ tokens }),
    clearStaleToolResults: () => {
      tokens -= staleTokens;
      const freed = staleTokens;
      staleTokens = 0;
      return freed;
    },
  } satisfies HarnessSession;
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "anthropic",
    model: "claude-test",
    backendId: "anthropic",
    mode: "execute",
    pending: 0,
  } as Conv;
  return { conv, compact };
}

const recorded = { author: undefined, priorAuthors: [] };

test("a 195k fill with 130k of stale results clears them and does not compact", async () => {
  const { conv, compact } = claudeConv(195_000, 130_000);
  await execTurn(conv, "c-1", "turn-1", "hi", recorded);
  expect(compact).not.toHaveBeenCalled();
});

test("a 195k fill with nothing stale still compacts", async () => {
  const { conv, compact } = claudeConv(195_000, 0);
  await execTurn(conv, "c-2", "turn-1", "hi", recorded);
  expect(compact).toHaveBeenCalledTimes(1);
});
