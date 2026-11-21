import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelCallTiming } from "@houston/protocol";
import type { WireEvent } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import type {
  HarnessBackend,
  HarnessSession,
  HarnessTimingEvent,
} from "../backends/types";
import { runTurn, type TurnDirectories } from "./turn-session";

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: { provider: "openai-codex", id: "gpt-6-luna", contextWindow: 1 },
  }),
}));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const CALL: ModelCallTiming = {
  provider: "openai-codex",
  model: "gpt-6-luna",
  ttfbMs: 2100,
  firstTokenMs: 400,
  inputTokens: 900,
  cacheReadTokens: 30_000,
  cacheWriteTokens: 0,
  outputTokens: 60,
};

function backend(fail: boolean): HarnessBackend {
  const wire = new Set<(e: WireEvent) => void>();
  const timings = new Set<(e: HarnessTimingEvent) => void>();
  const session = {
    subscribe(l: (e: WireEvent) => void) {
      wire.add(l);
      return () => wire.delete(l);
    },
    subscribeModelCalls(l: (e: HarnessTimingEvent) => void) {
      timings.add(l);
      return () => timings.delete(l);
    },
    async prompt() {
      for (const l of timings) l({ type: "call", call: CALL });
      if (fail) throw new Error("socket hang up");
      for (const l of wire) l({ type: "text", data: "42" });
    },
    abort: async () => undefined,
    dispose: () => undefined,
    setModel: async () => undefined,
    compact: async () => undefined,
    setThinkingLevel: () => undefined,
    getContextUsage: () => undefined,
  } as HarnessSession;
  return { id: "pi", createSession: async () => session };
}

async function run(fail: boolean) {
  const turnRoot = await mkdtemp(join(tmpdir(), "turn-mc-"));
  const dirs: TurnDirectories = {
    turnRoot,
    workspaceDir: join(turnRoot, "store", "workspace"),
    dataDir: join(turnRoot, "store", "data"),
  };
  await mkdir(dirs.workspaceDir, { recursive: true });
  await mkdir(dirs.dataDir, { recursive: true });
  return runTurn(
    dirs,
    {
      conversationId: "c1",
      text: "hello",
      provider: "openai-codex",
      emit: () => undefined,
      signal: undefined,
      turnId: "t1",
    },
    { createBackend: () => backend(fail) },
  );
}

test("a clean pooled turn returns its calls on the outcome", async () => {
  const outcome = await run(false);
  expect(outcome.error).toBeUndefined();
  expect(outcome.modelCalls).toEqual({
    v: 1,
    turnId: "t1",
    backend: "pi",
    startupMs: {},
    calls: [CALL],
    droppedCalls: 0,
  });
});

test("a pooled turn that threw keeps what it measured", async () => {
  const outcome = await run(true);
  expect(outcome.modelCalls?.calls).toEqual([CALL]);
});
