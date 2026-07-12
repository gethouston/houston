import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterAll, expect, test, vi } from "vitest";

// Keep any file the chat module touches inside a throwaway dir.
process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-chat-noauth-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-chat-ws-"),
);

// Drive the connected/logged-out state hermetically — the runtime's module-level
// authStorage is shared across suites (serve.test.ts writes served credentials
// into it), so reading it would be order-dependent. Mocking activeProvider pins
// the state. resolveModel keeps its real throw so the createAgentSession fallback
// produces the same user-facing error if it is ever reached.
const providerState = vi.hoisted(() => ({
  connectedProvider: null as string | null,
}));
// Spread the real module so every export the chat graph imports (PROVIDERS for
// auth/serve, activeEffort, etc.) stays available; override only the
// auth-sensitive reads so the connected/logged-out state stays hermetic (the
// module-level authStorage is shared across suites and would be order-dependent).
vi.mock("../ai/providers", async (importOriginal) => {
  const realProviders =
    await importOriginal<typeof import("../ai/providers")>();
  return {
    ...realProviders,
    activeProvider: () => providerState.connectedProvider,
    resolveModel: () => {
      throw new Error(
        "No provider connected. Log in with Claude or Codex first.",
      );
    },
  };
});

const { runTurn, cancelTurn, ensureProviderForTurn, disposeConversation } =
  await import("./chat");
const { conversations } = await import("./conversation-cache");
const { switchNeedsCompaction } = await import("./provider-switch");

type Conv = Parameters<typeof conversations.set>[1];

/** A minimal cached Conversation whose session records aborts. */
function fakeCachedConv(turnId?: string): {
  conv: Conv;
  aborted: () => boolean;
} {
  let aborted = false;
  const conv = {
    session: {
      subscribe: () => () => {},
      async abort() {
        aborted = true;
      },
      dispose() {},
    },
    queue: Promise.resolve(),
    provider: "openai",
    model: "gpt-x",
    backendId: "pi",
    mode: "execute",
    pending: 0,
    turnId,
  } as unknown as Conv;
  return { conv, aborted: () => aborted };
}
const { subscribe } = await import("./bus");
const { createSessionsStore } = await import(
  "../backends/claude/sessions-store"
);

afterAll(() => vi.restoreAllMocks());

test("ensureProviderForTurn reports null when logged out and the provider when connected", async () => {
  // The message route gates the turn on this: null => 409 (the request fails and
  // the client shows the error), a provider => the turn is accepted.
  providerState.connectedProvider = null;
  expect(await ensureProviderForTurn()).toBeNull();

  providerState.connectedProvider = "openai-codex";
  expect(await ensureProviderForTurn()).toBe("openai-codex");
});

test("runTurn refuses with a clear error (never a hang) if the provider vanished mid-turn", async () => {
  // Cheap defense for the narrow window where the provider is logged out after
  // the route accepted the turn but before it runs (a cached session would skip
  // resolveModel's guard and otherwise reach prompt() and spin forever).
  providerState.connectedProvider = null;
  const events: WireEvent[] = [];
  const unsub = subscribe("conv-noauth", (e) => events.push(e));

  await runTurn("conv-noauth", "are you there?");
  unsub();

  const err = events.find(
    (e): e is Extract<WireEvent, { type: "error" }> => e.type === "error",
  );
  expect(err).toBeDefined();
  expect(err?.data.message).toContain("No provider connected");
  expect(events.some((e) => e.type === "done")).toBe(false);
});

test("cancelTurn stamps stoppedTurnId on the executing turn, then aborts", async () => {
  // The durable "stopped by user" seam: cancelTurn marks the executing turn so
  // execTurn can persist `stopped: true` (pi resolves the aborted turn clean, so
  // this marker is the only trace). Only when a turn is actually executing.
  const live = fakeCachedConv("turn-live");
  conversations.set("conv-cancel-live", live.conv);
  expect(await cancelTurn("conv-cancel-live")).toBe(true);
  expect((live.conv as { stoppedTurnId?: string }).stoppedTurnId).toBe(
    "turn-live",
  );
  expect(live.aborted()).toBe(true);

  // A stop that raced turn end (no turnId) marks nothing — there is no turn to
  // stamp — but still aborts.
  const idle = fakeCachedConv(undefined);
  conversations.set("conv-cancel-idle", idle.conv);
  expect(await cancelTurn("conv-cancel-idle")).toBe(true);
  expect(
    (idle.conv as { stoppedTurnId?: string }).stoppedTurnId,
  ).toBeUndefined();

  // A conversation that isn't cached has no live turn to stop.
  expect(await cancelTurn("conv-not-cached")).toBe(false);
});

test("disposeConversation with deleteSessions purges the anthropic SDK session mapping", async () => {
  // A conversation that ran on the Claude backend has a sessions.json mapping;
  // deleting the conversation must drop it too, not just pi's transcript dir.
  const dataDir = process.env.HOUSTON_DATA_DIR as string;
  const store = createSessionsStore(dataDir);
  store.setSessionId("conv-anthropic", "sess-xyz");
  expect(store.getSessionId("conv-anthropic")).toBe("sess-xyz");

  await disposeConversation("conv-anthropic", { deleteSessions: true });

  expect(
    createSessionsStore(dataDir).getSessionId("conv-anthropic"),
  ).toBeUndefined();
});

test("switchNeedsCompaction: replays under the fit fraction, compacts over it, replays when unknown", () => {
  // A 258_400-token window has a 206_720 cutoff (0.8).
  expect(switchNeedsCompaction(10_000, 258_400)).toBe(false);
  expect(switchNeedsCompaction(206_720, 258_400)).toBe(false); // exactly at the cutoff still fits
  expect(switchNeedsCompaction(206_721, 258_400)).toBe(true); // just over -> compact
  expect(switchNeedsCompaction(300_000, 258_400)).toBe(true);
  // Unknown prior fill: no proof it won't fit -> replay (don't spend a summarizer).
  expect(switchNeedsCompaction(null, 1_000)).toBe(false);
});
