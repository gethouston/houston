import { test, expect, afterAll, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";

// Keep any file the chat module touches inside a throwaway dir.
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-chat-noauth-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(join(tmpdir(), "houston-chat-ws-"));

// Drive the connected/logged-out state hermetically — the runtime's module-level
// authStorage is shared across suites (serve.test.ts writes served credentials
// into it), so reading it would be order-dependent. Mocking activeProvider pins
// the state. resolveModel keeps its real throw so the createAgentSession fallback
// produces the same user-facing error if it is ever reached.
let connectedProvider: string | null = null;
mock.module("../ai/providers", () => ({
  activeProvider: () => connectedProvider,
  resolveModel: () => {
    throw new Error("No provider connected. Log in with Claude or Codex first.");
  },
}));

const { runTurn, ensureProviderForTurn } = await import("./chat");
const { subscribe } = await import("./bus");

afterAll(() => mock.restore());

test("ensureProviderForTurn reports null when logged out and the provider when connected", async () => {
  // The message route gates the turn on this: null => 409 (the request fails and
  // the client shows the error), a provider => the turn is accepted.
  connectedProvider = null;
  expect(await ensureProviderForTurn()).toBeNull();

  connectedProvider = "openai-codex";
  expect(await ensureProviderForTurn()).toBe("openai-codex");
});

test("runTurn refuses with a clear error (never a hang) if the provider vanished mid-turn", async () => {
  // Cheap defense for the narrow window where the provider is logged out after
  // the route accepted the turn but before it runs (a cached session would skip
  // resolveModel's guard and otherwise reach prompt() and spin forever).
  connectedProvider = null;
  const events: WireEvent[] = [];
  const unsub = subscribe("conv-noauth", (e) => events.push(e));

  await runTurn("conv-noauth", "are you there?");
  unsub();

  const err = events.find((e): e is Extract<WireEvent, { type: "error" }> => e.type === "error");
  expect(err).toBeDefined();
  expect(err!.data.message).toContain("No provider connected");
  expect(events.some((e) => e.type === "done")).toBe(false);
});
