import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelCallReport, ModelCallTiming } from "@houston/protocol";
import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type {
  HarnessSession,
  HarnessTimingEvent,
  ResolvedModel,
} from "../backends/types";

/**
 * A standing engine's turn hands its model-call report to the settle report,
 * the one message every turn end sends its host (mission-settle.ts): the
 * harness's per-call timings plus the turn's own startup costs, on the clean
 * path and the thrown one alike.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-mc-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-mc-ws-"),
);

const state = vi.hoisted(() => ({
  model: null as ResolvedModel | null,
  settles: [] as { status: string; modelCalls?: ModelCallReport }[],
}));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => state.model,
    activeProvider: () => "anthropic",
    activeEffort: () => null,
  };
});
vi.mock("./mission-settle", () => ({
  reportMissionSettle: (
    _id: string,
    status: string,
    _interaction: unknown,
    _turnId: string,
    _stopped: boolean,
    modelCalls?: ModelCallReport,
  ) => state.settles.push({ status, modelCalls }),
}));

await import("./conversation-cache");
const { execTurn } = await import("./exec-turn");
type Conversation = import("./conversation-cache").Conversation;

const CALL: ModelCallTiming = {
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  ttfbMs: 1800,
  firstTokenMs: 600,
  inputTokens: 12,
  cacheReadTokens: 20_000,
  cacheWriteTokens: 300,
  outputTokens: 150,
};

/** A Claude-backend session that spawns, answers in one call, or throws. */
class TimedSession implements HarnessSession {
  private wire = new Set<(e: WireEvent) => void>();
  private timings = new Set<(e: HarnessTimingEvent) => void>();
  constructor(private readonly fail = false) {}
  subscribe(l: (e: WireEvent) => void): () => void {
    this.wire.add(l);
    return () => this.wire.delete(l);
  }
  subscribeModelCalls(l: (e: HarnessTimingEvent) => void): () => void {
    this.timings.add(l);
    return () => this.timings.delete(l);
  }
  async prompt(): Promise<void> {
    for (const l of this.timings) l({ type: "harness_init", ms: 750 });
    if (this.fail) throw new Error("socket hang up");
    for (const l of this.timings) l({ type: "call", call: CALL });
    for (const l of this.wire) l({ type: "text", data: "Hola" });
  }
  async abort(): Promise<void> {}
  dispose(): void {}
  async setModel(): Promise<void> {}
  async compact(): Promise<undefined> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 100 };
  }
}

function convWith(session: HarnessSession): Conversation {
  return {
    session,
    queue: Promise.resolve(),
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    backendId: "anthropic",
    mode: "execute",
  } as unknown as Conversation;
}

afterEach(() => {
  state.model = null;
  state.settles = [];
  vi.restoreAllMocks();
});

const recorded = { author: undefined, priorAuthors: [] };
const SONNET: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-5-5",
  contextWindow: 1_000_000,
};

test("a clean turn settles with its calls, the CLI spawn and the engine's startup, queue wait apart", async () => {
  state.model = SONNET;
  // The turn waited 250 ms for the workspace lock after its session built.
  const startup = { sessionBuildMs: 31.4, queuedAt: performance.now() - 250 };
  await execTurn(
    convWith(new TimedSession()),
    "conv-mc-1",
    "turn-mc-1",
    "hi",
    recorded,
    undefined,
    undefined,
    startup,
  );
  expect(state.settles).toHaveLength(1);
  const report = state.settles[0]?.modelCalls;
  expect(report).toMatchObject({
    v: 1,
    turnId: "turn-mc-1",
    backend: "claude",
    calls: [CALL],
    droppedCalls: 0,
    startupMs: { harness_init: 750, session_build: 31 },
  });
  expect(report?.startupMs.queue_wait).toBeGreaterThanOrEqual(250);
  expect(report?.startupMs.pre_prompt).toBeLessThan(250);
});

test("a thrown turn still settles with what it measured", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  state.model = SONNET;
  await execTurn(
    convWith(new TimedSession(true)),
    "conv-mc-2",
    "turn-mc-2",
    "hi",
    recorded,
  );
  expect(state.settles.at(-1)?.status).toBe("error");
  expect(state.settles.at(-1)?.modelCalls).toMatchObject({
    turnId: "turn-mc-2",
    calls: [],
    startupMs: { harness_init: 750 },
  });
});
