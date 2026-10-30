import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  PendingInteraction,
  WireEvent,
  WireFrame,
} from "@houston/runtime-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { HarnessSession, ResolvedModel } from "../backends/types";

/**
 * A standing engine's turn runs the follow-up safety net after the prompt:
 * a GPT reply that skipped `suggest_actions` still ends on a `done` carrying
 * the bubbles, the pass adds no frame, and a Stop that lands during the pass
 * settles the turn as stopped instead.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-fu-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-fu-ws-"),
);

const state = vi.hoisted(() => ({
  model: null as ResolvedModel | null,
  settles: [] as { status: string; interaction: unknown }[],
}));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => state.model,
    activeProvider: () => "openai-codex",
    activeEffort: () => null,
  };
});
vi.mock("./mission-settle", () => ({
  reportMissionSettle: (_id: string, status: string, interaction: unknown) =>
    state.settles.push({ status, interaction }),
}));

await import("./conversation-cache");
const { execTurn } = await import("./exec-turn");
const bus = await import("./bus");
type Conversation = import("./conversation-cache").Conversation;

const ACTIONS = [
  { id: "a", label: "Otra", message: "Haz otra" },
  { id: "b", label: "Ajusta", message: "Ajústalo" },
];
const GPT: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5.6-sol",
  contextWindow: 400_000,
};

beforeEach(() => {
  state.model = GPT;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  state.settles = [];
  vi.restoreAllMocks();
});

/** A pi session whose model answers in plain text and never calls the tool. */
function gptSession(onForce: () => void = () => undefined) {
  const wire = new Set<(e: WireEvent) => void>();
  const oneShotText = vi.fn(async (): Promise<string> => {
    onForce();
    return JSON.stringify({ actions: ACTIONS });
  });
  const session = {
    subscribe(l: (e: WireEvent) => void) {
      wire.add(l);
      return () => wire.delete(l);
    },
    async prompt() {
      for (const l of wire) l({ type: "text", data: "Listo, ya está." });
    },
    oneShotText,
    followUpPassServed: () => true,
    abort: async () => undefined,
    dispose: () => undefined,
    setModel: async () => undefined,
    compact: async () => undefined,
    setThinkingLevel: () => undefined,
    getContextUsage: () => ({ tokens: 100 }),
  } as HarnessSession;
  return { session, oneShotText };
}

function convWith(session: HarnessSession): Conversation {
  return {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;
}

const recorded = { author: undefined, priorAuthors: [] };

async function run(conv: Conversation, id: string) {
  const frames: WireFrame[] = [];
  const unsubscribe = bus.subscribe(id, (frame) => frames.push(frame));
  await execTurn(conv, id, `${id}-turn`, "hola", recorded);
  unsubscribe();
  return frames;
}

test("the done frame carries the recovered bubbles and the pass emits nothing", async () => {
  const { session, oneShotText } = gptSession();
  const frames = await run(convWith(session), "activity-fu-1");
  expect(oneShotText).toHaveBeenCalledTimes(1);
  const expected: PendingInteraction = {
    steps: [{ kind: "suggest_actions", id: "a1", actions: ACTIONS }],
  };
  expect(frames.map((f) => f.type)).toEqual(["text", "done"]);
  expect(frames.at(-1)).toMatchObject({ pendingInteraction: expected });
  expect(state.settles).toEqual([
    { status: "needs_you", interaction: expected },
  ]);
});

test("a Stop during the pass settles the turn stopped, without bubbles", async () => {
  const id = "activity-fu-2";
  let conv: Conversation | undefined;
  const { session } = gptSession(() => {
    if (conv) conv.stoppedTurnId = `${id}-turn`;
  });
  conv = convWith(session);
  const frames = await run(conv, id);
  expect(frames.map((f) => f.type)).toEqual(["text"]);
  expect(state.settles).toEqual([{ status: "needs_you", interaction: null }]);
});
