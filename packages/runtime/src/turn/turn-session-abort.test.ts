import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import { runTurn } from "./turn-session";

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
      abort: () => {},
      prompt: async () => {
        // The DOMException a caller's AbortSignal raises when the cancel
        // lands mid-request (usually pi resolves an abort clean instead).
        throw new DOMException("This operation was aborted", "AbortError");
      },
    }),
  }),
}));

test("an abort raised out of prompt() ends the turn quietly, not as an error", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const workspaceDir = await mkdtemp(join(tmpdir(), "turn-abort-ws-"));
  const dataDir = await mkdtemp(join(tmpdir(), "turn-abort-data-"));
  const frames: WireFrame[] = [];

  const outcome = await runTurn(
    { workspaceDir, dataDir, turnRoot: workspaceDir },
    {
      conversationId: "c1",
      text: "hello",
      provider: "google",
      emit: (frame) => frames.push(frame),
      signal: undefined,
      turnId: "t1",
    },
  );

  // A cancelled turn is not a failure: no outcome error (the per-turn server
  // would send a generic error frame), no provider_error frame, no Sentry
  // error (HOUSTON-APP-59E).
  expect(outcome).toEqual({});
  expect(frames.filter((frame) => frame.type === "provider_error")).toEqual([]);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
