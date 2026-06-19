import { test, expect, afterAll, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";

// Keep any file the chat module touches inside a throwaway dir.
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-chat-noauth-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(join(tmpdir(), "houston-chat-ws-"));

// Force the "no provider connected" state hermetically — the runtime's module-level
// authStorage is shared across suites (serve.test.ts writes served credentials into
// it), so reading it would be order-dependent. Mocking activeProvider pins the
// post-logout state regardless. resolveModel keeps its real throw so the gate and
// the createAgentSession fallback both produce the same user-facing error.
mock.module("../ai/providers", () => ({
  activeProvider: () => null,
  resolveModel: () => {
    throw new Error("No provider connected. Log in with Claude or Codex first.");
  },
}));

const { runTurn } = await import("./chat");
const { subscribe } = await import("./bus");

afterAll(() => mock.restore());

test("runTurn surfaces a clear error and never hangs when no provider is connected", async () => {
  const events: WireEvent[] = [];
  const unsub = subscribe("conv-noauth", (e) => events.push(e));

  // After logout a conversation's pi session may still be cached, but no provider
  // is connected. runTurn must publish a terminal `error` and never reach a turn;
  // otherwise the chat spins in "running" forever with no reply (HOU-539 follow-up).
  await runTurn("conv-noauth", "are you there?");
  unsub();

  const err = events.find((e): e is Extract<WireEvent, { type: "error" }> => e.type === "error");
  expect(err).toBeDefined();
  expect(err!.data.message).toContain("No provider connected");
  // Never started a turn → no terminal `done`, so the UI cannot stay in "running".
  expect(events.some((e) => e.type === "done")).toBe(false);
});
