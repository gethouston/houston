import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

/**
 * execTurn's TWO compaction call sites both go through the fact harvest, and
 * both hand it the conversation id — the harvest cannot read one from ambient
 * context (compaction runs outside `runWithConversationId`), so a call site that
 * forgot it would silently extract nothing for the assistant forever.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-comp-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-comp-ws-"),
);

const resolution = vi.hoisted(() => ({
  provider: "openai",
}));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    activeEffort: () => undefined,
    resolveModel: () => ({
      provider: resolution.provider,
      id: "gpt-x",
      contextWindow: 1_000_000,
      reasoning: false,
    }),
  };
});

// Both compaction TRIGGERS are decisions of their own pure modules (tested
// there); forcing them true is what puts this turn on the compaction path.
vi.mock("./autocompact", () => ({ needsAutocompact: () => true }));
vi.mock("./provider-switch", () => ({ switchNeedsCompaction: () => true }));
vi.mock("./durable-facts-harvest", () => ({
  compactWithFactHarvest: vi.fn(async () => {}),
}));

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
const { subscribe } = await import("./bus");
const { compactWithFactHarvest } = await import("./durable-facts-harvest");
const { ASSISTANT_CONVERSATION_ID } = await import(
  "@houston/host/src/routes/assistant"
);

type Conv = Parameters<typeof execTurn>[0];

function fakeConv(provider: string): Conv {
  const session = {
    subscribe: (listener: (e: WireEvent) => void) => {
      void listener;
      return () => {};
    },
    prompt: async () => {},
    abort: async () => {},
    dispose: () => {},
    setModel: async () => {},
    async compact(): Promise<undefined> {},
    setThinkingLevel: () => {},
    getContextUsage: () => ({ tokens: 900_000 }),
  } satisfies HarnessSession;
  return {
    session,
    queue: Promise.resolve(),
    provider,
    model: "gpt-x",
    backendId: "pi",
    mode: "execute",
    pending: 0,
  } as Conv;
}

const recorded = { author: undefined, priorAuthors: [] };

test("autocompact harvests facts for the conversation it compacts", async () => {
  vi.mocked(compactWithFactHarvest).mockClear();
  const conv = fakeConv("openai");

  await execTurn(conv, ASSISTANT_CONVERSATION_ID, "turn-1", "hi", recorded);

  expect(compactWithFactHarvest).toHaveBeenCalledWith(
    conv.session,
    ASSISTANT_CONVERSATION_ID,
  );
});

test("the provider-switch compaction harvests facts too", async () => {
  vi.mocked(compactWithFactHarvest).mockClear();
  // The turn resolves onto a DIFFERENT provider than the cached session's, so
  // the switch compacts before the prompt and autocompact then no-ops.
  const conv = fakeConv("google");
  const events: WireEvent[] = [];
  const unsub = subscribe(ASSISTANT_CONVERSATION_ID, (e) => events.push(e));

  await execTurn(conv, ASSISTANT_CONVERSATION_ID, "turn-2", "hi", recorded);
  unsub();

  expect(compactWithFactHarvest).toHaveBeenCalledTimes(1);
  expect(compactWithFactHarvest).toHaveBeenCalledWith(
    conv.session,
    ASSISTANT_CONVERSATION_ID,
  );
  // The ONE call came from the switch (it announced a summarized switch), not
  // from autocompact — which this turn skipped for exactly that reason.
  expect(
    events.find((e) => e.type === "provider_switched")?.data,
  ).toMatchObject({ summarized: true });
  expect(events.some((e) => e.type === "context_compacted")).toBe(false);
});
