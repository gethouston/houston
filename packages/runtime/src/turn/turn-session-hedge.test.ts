import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { WireFrame } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import {
  DEADLINE_MS,
  hedgedSession,
  neverAnswers,
} from "../ai/hedged-session.test-support";
import type { HarnessBackend } from "../backends/types";
import { loadConversation } from "../store/conversation-file";
import { runTurn, type TurnDirectories } from "./turn-session";

/**
 * A pooled turn whose provider never answers its first request: the hedge
 * sends it again at the deadline, the stall watchdog stays armed around the
 * prompt the whole time, and the turn completes with no card.
 */

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: { provider: "faux", id: "faux-1", contextWindow: 200_000 },
  }),
}));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

async function directories(): Promise<TurnDirectories> {
  const turnRoot = await mkdtemp(join(tmpdir(), "turn-hedge-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
  ]);
  return { turnRoot, workspaceDir, dataDir };
}

test("a pooled turn whose first request is never answered completes with no card", async () => {
  const dirs = await directories();
  const { session, faux } = await hedgedSession([
    neverAnswers,
    fauxAssistantMessage("Here is your answer."),
  ]);
  const backend: HarnessBackend = {
    id: "pi",
    createSession: async () => session,
  };
  const frames: WireFrame[] = [];

  const outcome = await runTurn(
    dirs,
    {
      conversationId: "c1",
      text: "hello",
      provider: "faux",
      emit: (frame) => frames.push(frame),
      signal: undefined,
      turnId: "t1",
    },
    {
      createBackend: () => backend,
      stallTimeoutMs: 60_000,
      // The watchdog's unanswered cut follows the same deadline (3 and a third).
      firstByteDeadlineMs: DEADLINE_MS,
    },
  );

  expect(outcome.error).toBeUndefined();
  expect(frames.filter((f) => f.type === "provider_error")).toEqual([]);
  expect(
    frames
      .filter(
        (f): f is Extract<WireFrame, { type: "text" }> => f.type === "text",
      )
      .map((f) => f.data)
      .join(""),
  ).toBe("Here is your answer.");
  expect(faux.state.callCount).toBe(2);
  const last = loadConversation(
    join(dirs.dataDir, "conversations"),
    "c1",
  )?.messages.at(-1);
  expect(last?.role).toBe("assistant");
  expect(last?.providerError).toBeUndefined();
});
