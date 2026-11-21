import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-count-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-count-ws-"),
);

const cache = vi.hoisted(() => new Map<string, unknown>());
const builds = vi.hoisted(() => new Map<string, Promise<void>>());
vi.mock("../ai/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/providers")>()),
  activeEffort: () => undefined,
  resolveModel: () => ({
    provider: "openai",
    id: "gpt-x",
    contextWindow: 1_000_000,
    reasoning: false,
  }),
}));
vi.mock("./provider-gate", () => ({
  connectedProviderForTurn: async () => "openai",
  pinnedProviderUnavailable: async () => false,
}));
vi.mock("./conversation-cache", () => ({
  getConversation: async (id: string) => {
    await builds.get(id);
    return cache.get(id);
  },
  switchBackendIfNeeded: async () => ({ rebuilt: false, preTokens: null }),
  switchModeIfNeeded: async () => ({ rebuilt: false }),
  conversations: {
    get: (id: string) => cache.get(id),
    peek: (id: string) => cache.get(id),
    delete: (id: string) => cache.delete(id),
  },
}));
vi.mock("../store/conversations", () => ({
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  getHistory: vi.fn(() => ({ messages: [] })),
  consumeSessionReplay: vi.fn(() => false),
}));

const { runTurn, cancelTurn } = await import("./chat");
const { turnsInFlight } = await import("./turn-inflight-count");
const { snapshot } = await import("./bus");
const { withWorkdirLock } = await import("./workdir-lock");
const { config } = await import("../config");

function cachedConv(id: string, stoppable: boolean) {
  const listeners = new Set<(e: WireEvent) => void>();
  const emit = (e: WireEvent) => {
    for (const l of [...listeners]) l(e);
  };
  const aborted = Promise.withResolvers<void>();
  const prompted = Promise.withResolvers<void>();
  let prompts = 0;
  const session: HarnessSession = {
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async prompt() {
      prompts++;
      emit({ type: "text", data: "working on it" });
      prompted.resolve();
      if (stoppable) await aborted.promise;
      emit({
        type: "usage",
        data: { context_tokens: 0, output_tokens: 0, cached_tokens: 0 },
      });
    },
    abort: async () => aborted.resolve(),
    dispose() {},
    async setModel() {},
    async compact(): Promise<undefined> {},
    setThinkingLevel() {},
    getContextUsage: () => ({ tokens: 0 }),
  };
  cache.set(id, {
    session,
    queue: Promise.resolve(),
    provider: "openai",
    model: "gpt-x",
    backendId: "pi",
    mode: "execute",
    pending: 0,
  });
  return { prompted: prompted.promise, prompts: () => prompts };
}

async function until(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !ready(); i++)
    await new Promise((r) => setTimeout(r, 0));
}

test("turns waiting on the workdir lock or on their conversation's queue count as in flight", async () => {
  const id = "count-queued";
  const conv = cachedConv(id, false);
  const lock = Promise.withResolvers<void>();
  const holder = withWorkdirLock(config.workspaceDir, () => lock.promise);

  const first = runTurn(id, "first");
  const second = runTurn(id, "second");
  await until(() => turnsInFlight() === 2);

  expect(turnsInFlight()).toBe(2);
  expect(conv.prompts()).toBe(0);

  lock.resolve();
  await holder;
  await Promise.all([first, second]);
  expect(conv.prompts()).toBe(2);
  expect(turnsInFlight()).toBe(0);
  cache.delete(id);
});

test("a stopped turn stops counting once it unwinds", async () => {
  const id = "count-stopped";
  const conv = cachedConv(id, true);

  const turn = runTurn(id, "go");
  await conv.prompted;
  expect(turnsInFlight()).toBe(1);

  await cancelTurn(id);
  await turn;
  expect(turnsInFlight()).toBe(0);
  expect(snapshot(id).running).toBe(false);
  cache.delete(id);
});

test("an accepted turn counts while its session is still being built", async () => {
  const id = "count-building";
  const conv = cachedConv(id, false);
  const build = Promise.withResolvers<void>();
  builds.set(id, build.promise);

  const turn = runTurn(id, "go");
  expect(turnsInFlight()).toBe(1);

  build.resolve();
  await turn;
  expect(conv.prompts()).toBe(1);
  expect(turnsInFlight()).toBe(0);
  builds.delete(id);
  cache.delete(id);
});
