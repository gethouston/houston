import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TurnMode } from "@houston/protocol";
import { afterEach, expect, test, vi } from "vitest";
import type { HarnessSession, ResolvedModel } from "../backends/types";

/**
 * LIVE MODE SWITCH — the user changes the Mode pill WHILE the agent works
 * (Claude Code's shift+tab): `setLiveTurnMode` mutates the executing turn's
 * live-mode ref, `currentTurnMode()` sees the flip mid-prompt, and the
 * execute-time gates (live-mode-gate.ts) start/stop firing accordingly.
 * Between turns there is no ref — the switch reports `applied: false` and the
 * next turn's pin carries the mode instead.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-livemode-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-livemode-ws-"),
);

const modelState = vi.hoisted(() => ({ model: null as ResolvedModel | null }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => modelState.model,
    activeEffort: () => null,
  };
});

await import("./conversation-cache");
const { execTurn } = await import("./exec-turn");
const { conversations } = await import("./conversation-cache");
const { setLiveTurnMode } = await import("./chat");
const { currentTurnMode, runWithTurnMode } = await import(
  "./turn-mode-context"
);
const { assertNotAutoMode, assertNotPlanMode } = await import(
  "./live-mode-gate"
);
type Conversation = import("./conversation-cache").Conversation;

class FakeSession implements HarnessSession {
  constructor(readonly onPrompt: () => Promise<void> | void) {}
  subscribe(): () => void {
    return () => {};
  }
  async prompt(): Promise<void> {
    await this.onPrompt();
  }
  async abort(): Promise<void> {}
  dispose(): void {}
  async setModel(): Promise<void> {}
  async compact(): Promise<void> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 0 };
  }
}

const OPENAI: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5-codex",
  contextWindow: 400_000,
};

function makeConv(session: HarnessSession): Conversation {
  return {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
    pending: 0,
  } as unknown as Conversation;
}

afterEach(() => {
  modelState.model = null;
  conversations.clear();
});

test("currentTurnMode reads the live ref, so a mid-flight mutation is visible", () => {
  const ref = { current: "execute" as TurnMode };
  runWithTurnMode(ref, () => {
    expect(currentTurnMode()).toBe("execute");
    ref.current = "plan";
    expect(currentTurnMode()).toBe("plan");
  });
  expect(currentTurnMode()).toBeUndefined();
});

test("the plan/auto gates fire from the LIVE mode and are no-ops outside a turn", () => {
  // Outside a turn: no ambient mode, no gate.
  expect(() => assertNotPlanMode("act")).not.toThrow();
  expect(() => assertNotAutoMode("wait")).not.toThrow();

  const ref = { current: "execute" as TurnMode };
  runWithTurnMode(ref, () => {
    expect(() => assertNotPlanMode("act")).not.toThrow();
    expect(() => assertNotAutoMode("wait")).not.toThrow();
    ref.current = "plan";
    expect(() => assertNotPlanMode("act")).toThrow(/Plan mode/);
    expect(() => assertNotAutoMode("wait")).not.toThrow();
    ref.current = "auto";
    expect(() => assertNotPlanMode("act")).not.toThrow();
    expect(() => assertNotAutoMode("wait")).toThrow(/Autopilot mode/);
  });
});

test("setLiveTurnMode flips the EXECUTING turn's ambient mode mid-prompt", async () => {
  const seen: Array<TurnMode | undefined> = [];
  const session = new FakeSession(() => {
    // Inside the turn: the ambient mode is the pin's, then the user's live
    // switch (the route's call) is visible to the SAME running prompt.
    seen.push(currentTurnMode());
    expect(setLiveTurnMode("conv-live", "plan")).toBe(true);
    seen.push(currentTurnMode());
  });
  const conv = makeConv(session);
  conversations.set("conv-live", conv);
  modelState.model = OPENAI;

  await execTurn(
    conv,
    "conv-live",
    "turn-1",
    "do the thing",
    { author: undefined, priorAuthors: [] },
    { mode: "execute" },
  );

  expect(seen).toEqual(["execute", "plan"]);
  // The ref retires with the turn: nothing left to apply live between turns.
  expect(conv.liveMode).toBeUndefined();
  expect(setLiveTurnMode("conv-live", "auto")).toBe(false);
});

test("setLiveTurnMode is benign for an unknown conversation", () => {
  expect(setLiveTurnMode("no-such-conversation", "plan")).toBe(false);
});
