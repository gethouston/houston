import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent, WireFrame } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

/**
 * A Stop ends the turn's stream for good. cancelTurn publishes the terminal
 * "Stopped by user" frame and then aborts, and pi keeps emitting while it
 * unwinds (the aborted tool's `tool_end`, the aborted `turn_end`'s `usage`);
 * the turn's file diff lands after prompt() resolves. None of that may reach
 * the bus: one frame after the terminal one flips the stream snapshot back to
 * running, and the pod then reads busy forever.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-stop-"));
const WORKSPACE = mkdtempSync(join(tmpdir(), "houston-stop-ws-"));
process.env.HOUSTON_WORKSPACE_DIR = WORKSPACE;

const cache = vi.hoisted(() => new Map<string, unknown>());
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
vi.mock("./conversation-cache", () => ({
  switchBackendIfNeeded: vi.fn(async () => ({
    rebuilt: false,
    preTokens: null,
  })),
  switchModeIfNeeded: vi.fn(async () => ({ rebuilt: false })),
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

const { execTurn, recordUserTurn } = await import("./exec-turn");
const { snapshot, subscribe } = await import("./bus");
const { cancelTurn, STOPPED_BY_USER } = await import("./conversation-control");
const { appendAssistantMessage } = await import("../store/conversations");

type Conv = Parameters<typeof execTurn>[0];

/**
 * Run one turn on a session that streams `head`, writes a file, and streams
 * `tail`. With `stop`, the user presses Stop once the head streamed and the
 * session streams `tail` while it unwinds the abort — pi's shape.
 */
async function runTurn(
  id: string,
  head: WireEvent[],
  tail: WireEvent[],
  stop: boolean,
): Promise<WireFrame[]> {
  const listeners = new Set<(e: WireEvent) => void>();
  const emit = (e: WireEvent) => {
    for (const l of Array.from(listeners)) l(e);
  };
  const aborted = Promise.withResolvers<void>();
  const streamed = Promise.withResolvers<void>();
  const session: HarnessSession = {
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async prompt() {
      for (const e of head) emit(e);
      writeFileSync(join(WORKSPACE, `${id}.md`), "draft");
      streamed.resolve();
      if (stop) await aborted.promise;
      for (const e of tail) emit(e);
    },
    abort: async () => aborted.resolve(),
    dispose() {},
    async setModel() {},
    async compact(): Promise<undefined> {},
    setThinkingLevel() {},
    getContextUsage: () => ({ tokens: 0 }),
  };
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai",
    model: "gpt-x",
    backendId: "pi",
    mode: "execute",
    pending: 0,
  } as unknown as Conv;
  cache.set(id, conv);
  const frames: WireFrame[] = [];
  const unsub = subscribe(id, (f) => frames.push(f));
  const turnId = `${id}-turn`;
  const turn = execTurn(
    conv,
    id,
    turnId,
    "go",
    recordUserTurn(conv, id, turnId, "go"),
  );
  await streamed.promise;
  if (stop) await cancelTurn(id);
  await turn;
  unsub();
  cache.delete(id);
  return frames;
}

/** The frame types published after the terminal "Stopped by user" frame. */
const afterStop = (frames: WireFrame[]) =>
  frames
    .slice(
      frames.findIndex(
        (f) => f.type === "error" && f.data.message === STOPPED_BY_USER,
      ) + 1,
    )
    .map((f) => f.type);

const persisted = (id: string) =>
  vi.mocked(appendAssistantMessage).mock.calls.find((c) => c[0] === id)?.[2];

const USAGE = { context_tokens: 10, output_tokens: 0, cached_tokens: 0 };
const TOOL = "integration_search";
const toolStart: WireEvent = {
  type: "tool_start",
  data: { name: TOOL, args: {} },
};
const toolEnd = (isError: boolean): WireEvent => ({
  type: "tool_end",
  data: { name: TOOL, isError },
});

test("a Stop mid-tool publishes nothing after the stop and leaves no turn running", async () => {
  const id = "stop-mid-tool";
  const tail: WireEvent[] = [toolEnd(true), { type: "usage", data: USAGE }];
  const frames = await runTurn(id, [toolStart], tail, true);

  expect(afterStop(frames)).toEqual([]);
  expect(snapshot(id).running).toBe(false);
  // The recorded message stays complete: only the live stream is cut.
  expect(persisted(id)).toMatchObject({
    stopped: true,
    usage: USAGE,
    tools: [{ name: TOOL, isError: true }],
    fileChanges: { created: [`${id}.md`] },
  });
});

test("a Stop mid-generation drops the aborted turn's usage frame and leaves no turn running", async () => {
  const id = "stop-mid-text";
  // The codex provider ends an aborted generation with an all-zero usage.
  const aborted = { context_tokens: 0, output_tokens: 0, cached_tokens: 0 };
  const frames = await runTurn(
    id,
    [{ type: "text", data: "Here is what I fou" }],
    [{ type: "usage", data: aborted }],
    true,
  );

  expect(afterStop(frames)).toEqual([]);
  expect(snapshot(id).running).toBe(false);
  expect(persisted(id)).toMatchObject({ stopped: true, usage: aborted });
});

test("a turn nobody stopped still streams tool_end, usage and its file diff, then settles", async () => {
  const id = "no-stop";
  const tail: WireEvent[] = [toolEnd(false), { type: "usage", data: USAGE }];
  const frames = await runTurn(id, [toolStart], tail, false);

  expect(frames.map((f) => f.type)).toEqual([
    "user",
    "tool_start",
    "tool_end",
    "usage",
    "file_changes",
    "done",
  ]);
  expect(frames.every((f) => f.turnId === `${id}-turn`)).toBe(true);
  expect(snapshot(id).running).toBe(false);
});
