import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent, WireFrame } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import type {
  HarnessBackend,
  HarnessSession,
  ModelPhase,
} from "../backends/types";
import { loadConversation } from "../store/conversation-file";
import { runTurn, type TurnDirectories } from "./turn-session";

/**
 * The model-stream stall watchdog on a POOLED turn: the same guard the
 * standing server arms around every prompt (session/stall-watchdog.ts). A
 * provider stream that goes silent must end the turn with the typed "stopped
 * responding" card instead of holding the sandbox until its lifetime runs out.
 */

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: { provider: "openai-codex", id: "gpt-6", contextWindow: 400_000 },
  }),
}));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

async function directories(): Promise<TurnDirectories> {
  const turnRoot = await mkdtemp(join(tmpdir(), "turn-stall-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
  ]);
  return { turnRoot, workspaceDir, dataDir };
}

/**
 * A session whose provider never answers: `prompt` hangs until aborted, then
 * pi's abort echo arrives as an unclassifiable provider_error and the prompt
 * resolves (pi resolves an aborted turn rather than throwing). `liveFor`
 * ticks the liveness feed that many times before going silent.
 */
function silentBackend(opts: { liveFor?: number; tickMs?: number } = {}) {
  const listeners = new Set<(e: WireEvent) => void>();
  const liveness = new Set<() => void>();
  let release: (() => void) | undefined;
  const session: HarnessSession = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeLiveness(listener) {
      liveness.add(listener);
      return () => liveness.delete(listener);
    },
    async prompt() {
      for (let i = 0; i < (opts.liveFor ?? 0); i++) {
        await new Promise((r) => setTimeout(r, opts.tickMs ?? 10));
        for (const tick of liveness) tick();
      }
      if (opts.liveFor !== undefined) {
        for (const l of listeners) l({ type: "text", data: "done" });
        return;
      }
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    async abort() {
      for (const l of listeners)
        l({
          type: "provider_error",
          data: {
            kind: "unknown",
            provider: "openai-codex",
            raw_excerpt: "This operation was aborted",
          },
        });
      release?.();
    },
    dispose: () => undefined,
    setModel: async () => undefined,
    compact: async () => undefined,
    setThinkingLevel: () => undefined,
    getContextUsage: () => undefined,
  };
  const backend: HarnessBackend = {
    id: "pi",
    createSession: async () => session,
  };
  return backend;
}

/**
 * A session that reports its round-trips: the request goes out and, with
 * `loop`, the response opens and streams that unit over and over; without
 * it the response never opens. Either way it hangs until aborted.
 */
function phasedBackend(opts: { loop?: string; staleError?: boolean } = {}) {
  const listeners = new Set<(e: WireEvent) => void>();
  const phases = new Set<(p: ModelPhase) => void>();
  let aborted = false;
  let release: (() => void) | undefined;
  const session: HarnessSession = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeModelPhase(listener) {
      phases.add(listener);
      return () => phases.delete(listener);
    },
    async prompt() {
      for (const p of phases) p({ phase: "requesting", provider: "opencode" });
      if (opts.loop) {
        for (const p of phases) p({ phase: "responding" });
        for (let i = 0; i < 200 && !aborted; i++)
          for (const l of listeners) l({ type: "text", data: opts.loop });
      }
      if (aborted) return;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    async abort() {
      aborted = true;
      // pi flushes a failure it held from an attempt it had since retried
      // (a 429 before the looping reply) once the aborted prompt settles.
      if (opts.staleError)
        for (const l of listeners)
          l({
            type: "provider_error",
            data: {
              kind: "rate_limited",
              provider: "opencode",
              model: null,
              retry_after_seconds: null,
              message: "429 Too Many Requests",
            },
          });
      release?.();
    },
    dispose: () => undefined,
    setModel: async () => undefined,
    compact: async () => undefined,
    setThinkingLevel: () => undefined,
    getContextUsage: () => undefined,
  };
  const backend: HarnessBackend = {
    id: "pi",
    createSession: async () => session,
  };
  return backend;
}

async function run(
  dirs: TurnDirectories,
  backend: HarnessBackend,
  frames: WireFrame[],
  windows: { stallTimeoutMs?: number; firstByteDeadlineMs?: number } = {},
) {
  return runTurn(
    dirs,
    {
      conversationId: "c1",
      text: "hello",
      provider: "openai-codex",
      emit: (frame) => frames.push(frame),
      signal: undefined,
      turnId: "t1",
    },
    {
      createBackend: () => backend,
      stallTimeoutMs: windows.stallTimeoutMs ?? 40,
      firstByteDeadlineMs: windows.firstByteDeadlineMs ?? 15_000,
    },
  );
}

function persistedError(dirs: TurnDirectories) {
  return loadConversation(
    join(dirs.dataDir, "conversations"),
    "c1",
  )?.messages.at(-1)?.providerError;
}

test("a silent provider stream ends the pooled turn with the stopped-responding card", async () => {
  const dirs = await directories();
  const frames: WireFrame[] = [];

  const outcome = await run(dirs, silentBackend(), frames);

  const errors = frames.filter((frame) => frame.type === "provider_error");
  // pi's echo of our own abort is never surfaced; the synthesized card is.
  expect(errors).toHaveLength(1);
  expect(errors[0]?.data).toMatchObject({
    kind: "provider_internal",
    provider: "openai-codex",
    http_status: null,
  });
  expect(outcome.error).toBeUndefined();
  const last = loadConversation(
    join(dirs.dataDir, "conversations"),
    "c1",
  )?.messages.at(-1);
  expect(last?.role).toBe("assistant");
  expect(last?.providerError?.kind).toBe("provider_internal");
});

test("backend liveness keeps a long silent generation alive", async () => {
  const dirs = await directories();
  const frames: WireFrame[] = [];

  // Ten 10 ms ticks span 100 ms, well past the 40 ms window, but each one is
  // proof of life (a tool call's input streaming), so nothing is cut.
  await run(dirs, silentBackend({ liveFor: 10, tickMs: 10 }), frames);

  expect(frames.filter((frame) => frame.type === "provider_error")).toEqual([]);
});

test("a request the provider never answers ends the pooled turn once its retries have had their deadlines", async () => {
  const dirs = await directories();
  const frames: WireFrame[] = [];

  // The quiet-stream window is long; the unanswered one is what ends it.
  await run(dirs, phasedBackend(), frames, {
    stallTimeoutMs: 60_000,
    firstByteDeadlineMs: 15,
  });

  const errors = frames.filter((frame) => frame.type === "provider_error");
  expect(errors).toHaveLength(1);
  expect(errors[0]?.data).toMatchObject({
    kind: "provider_internal",
    provider: "openai-codex",
    message: expect.stringContaining("did not start answering"),
  });
  expect(persistedError(dirs)?.kind).toBe("provider_internal");
});

test("a reply stuck in a loop ends the pooled turn with the broken-response card", async () => {
  const dirs = await directories();
  const frames: WireFrame[] = [];

  await run(dirs, phasedBackend({ loop: "Symbol".repeat(20) }), frames, {
    stallTimeoutMs: 60_000,
    firstByteDeadlineMs: 60_000,
  });

  const errors = frames.filter((frame) => frame.type === "provider_error");
  expect(errors).toHaveLength(1);
  expect(errors[0]?.data).toMatchObject({
    kind: "malformed_response",
    provider: "openai-codex",
  });
  expect(persistedError(dirs)?.kind).toBe("malformed_response");
});

test("a loop after a retried failure settles on the loop's card, not the stale failure", async () => {
  const dirs = await directories();
  const frames: WireFrame[] = [];

  await run(
    dirs,
    phasedBackend({ loop: "Symbol".repeat(20), staleError: true }),
    frames,
    { stallTimeoutMs: 60_000, firstByteDeadlineMs: 60_000 },
  );

  const errors = frames.filter((frame) => frame.type === "provider_error");
  expect(errors.map((frame) => frame.data.kind)).toEqual([
    "malformed_response",
  ]);
  expect(persistedError(dirs)?.kind).toBe("malformed_response");
});
