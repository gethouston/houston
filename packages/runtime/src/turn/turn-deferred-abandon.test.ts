import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { createDeferredGate } from "./turn-deferred-gate";
import { runTurn } from "./turn-session";

const prompt = vi.hoisted(() => ({ stop: false }));

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: { provider: "google", id: "gemini-3.5-flash" },
  }),
}));
vi.mock("../backends/pi/backend", () => ({
  createPiBackend: () => ({
    createSession: async () => ({
      subscribe: () => () => {},
      getContextUsage: () => undefined,
      abort: () => {},
      prompt: async () => {
        if (prompt.stop)
          throw new DOMException("This operation was aborted", "AbortError");
      },
    }),
  }),
}));

async function runWithPendingFiles(stop: boolean) {
  prompt.stop = stop;
  const workspaceDir = await mkdtemp(join(tmpdir(), "abandon-ws-"));
  const dataDir = await mkdtemp(join(tmpdir(), "abandon-data-"));
  let fail: (error: Error) => void = () => undefined;
  const workspaceReady = new Promise<void>((_resolve, reject) => {
    fail = reject;
  });
  const abandonDeferred = vi.fn(() =>
    fail(new Error("the turn ended before its files were needed")),
  );
  const deferredGate = createDeferredGate(workspaceDir);
  deferredGate.observe(workspaceReady, {
    prioritize: () => undefined,
    manifest: new Map(),
  });
  const outcome = await runTurn(
    {
      workspaceDir,
      dataDir,
      turnRoot: workspaceDir,
      workspaceReady,
      abandonDeferred,
      deferredGate,
    },
    {
      conversationId: "c1",
      text: "hello",
      provider: "google",
      emit: () => undefined,
      signal: undefined,
      turnId: "t1",
    },
  );
  return { outcome, abandonDeferred };
}

test("a prompt that ends before the files land abandons them and settles", async () => {
  const { outcome, abandonDeferred } = await runWithPendingFiles(false);
  expect(abandonDeferred).toHaveBeenCalledTimes(1);
  expect(outcome.error).toBeUndefined();
});

test("a stop during the download abandons it too", async () => {
  const { outcome, abandonDeferred } = await runWithPendingFiles(true);
  expect(abandonDeferred).toHaveBeenCalledTimes(1);
  expect(outcome.error).toBeUndefined();
});
