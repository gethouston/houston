import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-early-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-early-ws-"),
);

const cache = vi.hoisted(() => new Map<string, unknown>());
const hooks = vi.hoisted(() => ({
  compactFill: null as number | null,
  onCompact: async () => {},
  replayed: false,
}));
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
  getConversation: async (id: string) => cache.get(id),
  switchBackendIfNeeded: async () => ({ rebuilt: false, preTokens: null }),
  switchModeIfNeeded: async () => ({ rebuilt: false }),
  conversations: {
    get: (id: string) => cache.get(id),
    peek: (id: string) => cache.get(id),
    delete: (id: string) => cache.delete(id),
  },
}));
vi.mock("./autocompact", () => ({
  needsAutocompact: (fill: number | null) => fill === hooks.compactFill,
}));
vi.mock("./autocompact-guard", () => ({
  runAutocompact: async () => {
    await hooks.onCompact();
    return true;
  },
}));
vi.mock("../store/conversations", () => ({
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  getHistory: vi.fn(() => ({ messages: [] })),
  consumeSessionReplay: vi.fn(() => hooks.replayed),
  stampSessionReplay: vi.fn(),
}));

const { runTurn, cancelTurn } = await import("./chat");
const { snapshot, subscribe } = await import("./bus");
const { turnsInFlight } = await import("./turn-inflight-count");
const { withWorkdirLock } = await import("./workdir-lock");
const { config } = await import("../config");
const { appendAssistantMessage, stampSessionReplay } = await import(
  "../store/conversations"
);

function cachedConv(id: string, backendId: string, fill = 0) {
  const tool = vi.fn();
  const session: HarnessSession = {
    subscribe: () => () => {},
    async prompt() {
      tool();
    },
    abort: async () => {},
    dispose() {},
    async setModel() {},
    async compact(): Promise<undefined> {},
    setThinkingLevel() {},
    getContextUsage: () => ({ tokens: fill }),
  };
  const conv: { turnId?: string } & Record<string, unknown> = {
    session,
    queue: Promise.resolve(),
    provider: "openai",
    model: "gpt-x",
    backendId,
    mode: "execute",
    pending: 0,
  };
  cache.set(id, conv);
  return { conv, tool };
}

function collect(id: string) {
  const frames: WireFrame[] = [];
  const unsub = subscribe(id, (f) => frames.push(f));
  return { frames, unsub };
}

async function until(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !ready(); i++)
    await new Promise((r) => setTimeout(r, 0));
}

const persisted = (id: string) =>
  vi.mocked(appendAssistantMessage).mock.calls.find((c) => c[0] === id)?.[2];

test.each([
  "pi",
  "anthropic",
])("a turn stopped while it waits on the workdir lock never prompts (%s backend)", async (backendId) => {
  const id = `early-lock-${backendId}`;
  const { conv, tool } = cachedConv(id, backendId);
  const { frames, unsub } = collect(id);
  const lock = Promise.withResolvers<void>();
  const holder = withWorkdirLock(config.workspaceDir, () => lock.promise);

  const turn = runTurn(id, "go");
  await until(() => conv.turnId !== undefined);
  expect(await cancelTurn(id)).toBe(true);
  lock.resolve();
  await holder;
  await turn;
  unsub();

  expect(tool).not.toHaveBeenCalled();
  expect(frames.map((f) => f.type)).toEqual(["user", "error"]);
  expect(snapshot(id).running).toBe(false);
  expect(turnsInFlight()).toBe(0);
  expect(persisted(id)).toMatchObject({ stopped: true });
});

test("a turn stopped during its pre-turn autocompact never prompts, and keeps the compaction", async () => {
  const id = "early-compact";
  hooks.compactFill = 950_000;
  hooks.onCompact = async () => {
    await cancelTurn(id);
  };
  const { tool } = cachedConv(id, "pi", 950_000);

  await runTurn(id, "go");

  expect(tool).not.toHaveBeenCalled();
  expect(snapshot(id).running).toBe(false);
  expect(persisted(id)).toMatchObject({
    stopped: true,
    compaction: { trigger: "proactive", pre_tokens: 950_000 },
  });
  hooks.compactFill = null;
});

test("a stopped turn that consumed a replay re-arms it for the next turn", async () => {
  const id = "early-replay";
  hooks.replayed = true;
  hooks.compactFill = 900_000;
  hooks.onCompact = async () => {
    await cancelTurn(id);
  };
  const { tool } = cachedConv(id, "pi", 900_000);

  await runTurn(id, "go");

  expect(tool).not.toHaveBeenCalled();
  expect(stampSessionReplay).toHaveBeenCalledWith(id);
  hooks.replayed = false;
  hooks.compactFill = null;
});
