import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterAll, expect, test, vi } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-chat-noauth-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-chat-ws-"),
);

const providerState = vi.hoisted(() => ({
  connectedProvider: null as string | null,
}));
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
const { serverClaudeLayout } = await import("../backends/claude/paths");

afterAll(() => vi.restoreAllMocks());

test("ensureProviderForTurn reports null when logged out and the provider when connected", async () => {
  providerState.connectedProvider = null;
  expect(await ensureProviderForTurn()).toBeNull();

  providerState.connectedProvider = "openai-codex";
  expect(await ensureProviderForTurn()).toBe("openai-codex");
});

test("runTurn refuses with a clear error (never a hang) if the provider vanished mid-turn", async () => {
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
  const live = fakeCachedConv("turn-live");
  conversations.set("conv-cancel-live", live.conv);
  expect(await cancelTurn("conv-cancel-live")).toBe(true);
  expect((live.conv as { stoppedTurnId?: string }).stoppedTurnId).toBe(
    "turn-live",
  );
  expect(live.aborted()).toBe(true);

  const idle = fakeCachedConv(undefined);
  conversations.set("conv-cancel-idle", idle.conv);
  expect(await cancelTurn("conv-cancel-idle")).toBe(true);
  expect(
    (idle.conv as { stoppedTurnId?: string }).stoppedTurnId,
  ).toBeUndefined();

  expect(await cancelTurn("conv-not-cached")).toBe(false);
});

test("disposeConversation with deleteSessions purges the anthropic SDK session mapping", async () => {
  const dataDir = process.env.HOUSTON_DATA_DIR as string;
  const store = createSessionsStore(serverClaudeLayout(dataDir));
  store.setSessionId("conv-anthropic", "sess-xyz");
  expect(store.getSessionId("conv-anthropic")).toBe("sess-xyz");

  await disposeConversation("conv-anthropic", { deleteSessions: true });

  expect(
    createSessionsStore(serverClaudeLayout(dataDir)).getSessionId(
      "conv-anthropic",
    ),
  ).toBeUndefined();
});

test("switchNeedsCompaction: replays under the fit fraction, compacts over it, replays when unknown", () => {
  expect(switchNeedsCompaction(10_000, 258_400)).toBe(false);
  expect(switchNeedsCompaction(206_720, 258_400)).toBe(false);
  expect(switchNeedsCompaction(206_721, 258_400)).toBe(true);
  expect(switchNeedsCompaction(300_000, 258_400)).toBe(true);
  expect(switchNeedsCompaction(null, 1_000)).toBe(false);
});
