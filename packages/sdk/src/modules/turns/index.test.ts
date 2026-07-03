import type { HoustonEngineClient, WireFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { createAuthExpiryNotifier } from "../../auth-expiry";
import type { CommandHandler } from "../../commands";
import type { ModuleContext } from "../../module-context";
import type { SdkConfig } from "../../ports";
import { ScopeStore } from "../../store";
import type { FeedOutput } from "./feed-output";
import { createTurnsModule } from "./index";
import type { ConversationVM } from "./vm-output";
import { conversationScope } from "./vm-output";

/**
 * The turns module: `turns/send`/`turns/cancel` command registration, the
 * built-in conversation VM, model/effort application, and the multiplexed
 * external output (one machinery, many outputs, single settle).
 */

const doneTurn: WireFrame[] = [
  { type: "sync", data: { running: false, partial: "", seq: 0 }, seq: 0 },
  { type: "text", data: "hi there", seq: 1 },
  { type: "done", data: null, seq: 2 },
];

/** A turn already in flight when we attach — for observer-facade coverage. */
const runningTurn: WireFrame[] = [
  { type: "sync", data: { running: true, partial: "", seq: 0 }, seq: 0 },
  { type: "text", data: "observed reply", seq: 1 },
  { type: "done", data: null, seq: 2 },
];

function harness(frames: WireFrame[] = doneTurn) {
  const store = new ScopeStore();
  const commands = new Map<string, CommandHandler>();
  const calls = {
    sends: 0,
    cancels: [] as string[],
    settings: [] as unknown[],
    providersListed: 0,
  };
  const client = {
    async streamEvents(_id: string, o: { onEvent: (f: WireFrame) => void }) {
      for (const f of frames) o.onEvent(f);
    },
    async sendMessage() {
      calls.sends++;
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
    async cancel(id: string) {
      calls.cancels.push(id);
      return { ok: true, cancelled: true };
    },
    async setSettings(input: unknown) {
      calls.settings.push(input);
      return {} as never;
    },
    // The picker resolves the owning provider from here (see model-settings.ts).
    async listProviders() {
      calls.providersListed++;
      return [
        {
          id: "anthropic",
          name: "Claude",
          configured: true,
          isActive: true,
          activeModel: "claude-sonnet-4-6",
          models: ["claude-sonnet-4-6", "claude-opus-4-8"],
        },
      ];
    },
  } as unknown as HoustonEngineClient;

  const ctx: ModuleContext = {
    config: { baseUrl: "http://x", ports: {} as SdkConfig["ports"] },
    store,
    // One injected engine for any agent id — this suite asserts through the
    // recorded calls, not per-agent URLs (see conversations for those).
    clientFor: () => client,
    authExpiry: createAuthExpiryNotifier(store),
    registerCommand: (type, handler) => commands.set(type, handler),
  };
  const mod = createTurnsModule(ctx);
  const vm = () => store.getSnapshot(conversationScope("c1")) as ConversationVM;
  return { store, commands, calls, mod, vm };
}

async function waitFor(cond: () => boolean, ms = 2_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

test("registers the turns/send, turns/cancel and turns/observe commands", () => {
  const { commands } = harness();
  expect([...commands.keys()].sort()).toEqual([
    "turns/cancel",
    "turns/observe",
    "turns/send",
  ]);
});

test("turns/send drives the conversation VM to a settled reply", async () => {
  const { commands, calls, vm } = harness();
  await commands.get("turns/send")?.({ conversationId: "c1", text: "hi" });
  await waitFor(() => vm()?.sessionStatus === "completed");

  expect(calls.sends).toBe(1);
  expect(vm().running).toBe(false);
  const texts = vm().feed.filter((f) => f.feed_type === "assistant_text");
  expect(texts).toEqual([
    { id: texts[0]?.id ?? "", feed_type: "assistant_text", data: "hi there" },
  ]);
});

test("the typed facade send() is the same path as the command", async () => {
  const { mod, vm } = harness();
  await mod.send({ conversationId: "c1", text: "hi" });
  await waitFor(() => vm()?.sessionStatus === "completed");
  expect(vm().feed.some((f) => f.data === "hi there")).toBe(true);
});

test("an attached external output sees every push, settled exactly once", async () => {
  const { mod, vm } = harness();
  const items: Array<{ feed_type?: string }> = [];
  const external: FeedOutput = {
    pushFeedItem: (_a, _s, item) => items.push(item as { feed_type?: string }),
    sessionStatus: () => {},
    persistBoardStatus: async () => {},
  };
  mod.addOutput(external);

  await mod.send({ conversationId: "c1", text: "hi" });
  await waitFor(() => vm()?.sessionStatus === "completed");

  // The external output got the same feed, and the sink settled ONCE.
  expect(items.some((i) => i.feed_type === "assistant_text")).toBe(true);
  expect(items.filter((i) => i.feed_type === "final_result")).toHaveLength(1);
});

test("a model switch resolves the owning provider and writes BOTH", async () => {
  const { commands, calls, vm } = harness();
  await commands.get("turns/send")?.({
    conversationId: "c1",
    text: "hi",
    model: "claude-opus-4-8",
    effort: "high",
  });
  await waitFor(() => vm()?.sessionStatus === "completed");
  // The runtime hard-fails a model under the wrong active provider, so the
  // facade must pair the pick with its owner (mirrors the web adapter).
  expect(calls.providersListed).toBe(1);
  expect(calls.settings).toEqual([
    { activeProvider: "anthropic", model: "claude-opus-4-8", effort: "high" },
  ]);
});

test("an effort-only switch never lists providers (no model to resolve)", async () => {
  const { commands, calls, vm } = harness();
  await commands.get("turns/send")?.({
    conversationId: "c1",
    text: "hi",
    effort: "high",
  });
  await waitFor(() => vm()?.sessionStatus === "completed");
  expect(calls.providersListed).toBe(0);
  expect(calls.settings).toEqual([{ effort: "high" }]);
});

test("observe surfaces an in-flight turn into the conversation VM", async () => {
  const { mod, vm } = harness(runningTurn);
  await mod.observe("c1");
  await waitFor(() => vm()?.sessionStatus === "completed");
  expect(vm().feed.some((f) => f.data === "observed reply")).toBe(true);
});

test("the turns/observe command drives the same observe path", async () => {
  const { commands, vm } = harness(runningTurn);
  await commands.get("turns/observe")?.({ conversationId: "c1" });
  await waitFor(() => vm()?.sessionStatus === "completed");
  expect(vm().feed.some((f) => f.data === "observed reply")).toBe(true);
});

test("turns/cancel aborts the conversation's turn", async () => {
  const { commands, calls } = harness();
  await commands.get("turns/cancel")?.({ conversationId: "c1" });
  expect(calls.cancels).toEqual(["c1"]);
});

test("a malformed turns/send payload throws (the registry's dispatch turns it into ok:false)", () => {
  const { commands } = harness();
  // The handler validates synchronously; CommandRegistry.dispatch wraps the
  // call in try/catch, so a throw here becomes a failed CommandResult.
  expect(() => commands.get("turns/send")?.({ text: "hi" })).toThrow(
    /conversationId/,
  );
});
