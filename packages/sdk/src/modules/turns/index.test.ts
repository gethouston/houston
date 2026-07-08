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
    sendOpts: [] as unknown[],
    cancels: [] as string[],
    settings: [] as unknown[],
    providersListed: 0,
    boardPersists: [] as Array<{ sessionKey: string; status: string }>,
  };
  const client = {
    async streamEvents(_id: string, o: { onEvent: (f: WireFrame) => void }) {
      for (const f of frames) o.onEvent(f);
    },
    async sendMessage(_id: string, _text: string, opts?: unknown) {
      calls.sends++;
      calls.sendOpts.push(opts);
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

  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const ctx: ModuleContext = {
    config: {
      baseUrl: "http://x",
      ports: { logger } as unknown as SdkConfig["ports"],
    },
    store,
    // One injected engine for any agent id — this suite asserts through the
    // recorded calls, not per-agent URLs (see conversations for those).
    clientFor: () => client,
    authExpiry: createAuthExpiryNotifier(store),
    registerCommand: (type, handler) => commands.set(type, handler),
  };
  // The default board-status persister the turns module drives on every turn
  // (backed by the activities module in the real SDK) — recorded here.
  const persistBoardStatus = async (
    _agentId: string,
    sessionKey: string,
    status: string,
  ) => {
    calls.boardPersists.push({ sessionKey, status });
  };
  const mod = createTurnsModule(ctx, persistBoardStatus);
  // Sends in this suite carry no agentId, so the VM lands on the "" agent slot.
  const vm = () =>
    store.getSnapshot(conversationScope("", "c1")) as ConversationVM;
  return { store, commands, calls, mod, vm };
}

async function waitFor(cond: () => boolean, ms = 2_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

test("registers the turns/send, turns/cancel, turns/observe and turns/history commands", () => {
  const { commands } = harness();
  expect([...commands.keys()].sort()).toEqual([
    "turns/cancel",
    "turns/history",
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
    {
      id: texts[0]?.id ?? "",
      feed_type: "assistant_text",
      data: "hi there",
      ts: expect.any(Number), // a live push is stamped at push time
    },
  ]);
});

test("turns/send pushes the user bubble pending, then confirms it (clock -> check)", async () => {
  const { store, commands, vm } = harness();
  const userPending: Array<boolean | undefined> = [];
  store.subscribe(conversationScope("", "c1"), (s) => {
    const u = (s as ConversationVM).feed.find(
      (f) => f.feed_type === "user_message",
    );
    if (u) userPending.push(u.pending);
  });

  await commands.get("turns/send")?.({ conversationId: "c1", text: "hi" });
  await waitFor(() => vm()?.sessionStatus === "completed");

  // It entered pending (a clock) and the reply's arrival confirmed it (a check).
  expect(userPending[0]).toBe(true);
  expect(userPending.at(-1)).toBeUndefined();
  const finalUser = vm().feed.find((f) => f.feed_type === "user_message");
  expect(finalUser?.pending).toBeUndefined();
});

test("an observed (resumed) conversation never shows a pending bubble", async () => {
  const { mod, vm } = harness(runningTurn);
  await mod.observe("c1");
  await waitFor(() => vm()?.sessionStatus === "completed");
  // observe pushes no optimistic bubble — nothing is unconfirmed on the surface.
  expect(vm().feed.some((f) => f.pending)).toBe(false);
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

test("the default board-status persister fires running at start and terminal on settle", async () => {
  const { mod, vm, calls } = harness();
  await mod.send({ conversationId: "c1", text: "hi" });
  await waitFor(() => vm()?.sessionStatus === "completed");
  // A running turn PATCHes the card to running, then to its terminal status —
  // the write the SDK path used to drop, keyed by the chat's id. The canned
  // reply carries no pending interaction, so the clean settle splits to `done`
  // (a turn that ended asking the user would settle `needs_you` instead).
  expect(calls.boardPersists.map((p) => p.status)).toEqual(["running", "done"]);
  expect(calls.boardPersists.every((p) => p.sessionKey === "c1")).toBe(true);
});

test("a model pick rides the send as a per-turn pin paired with its owner — never a settings write", async () => {
  const { commands, calls, vm } = harness();
  await commands.get("turns/send")?.({
    conversationId: "c1",
    text: "hi",
    model: "claude-opus-4-8",
    effort: "high",
  });
  await waitFor(() => vm()?.sessionStatus === "completed");
  // The runtime hard-fails a model under the wrong provider, so the facade
  // pairs the pick with its owner (from the live listing) on the wire pin.
  expect(calls.providersListed).toBe(1);
  expect(calls.sendOpts[0]).toMatchObject({
    provider: "anthropic",
    model: "claude-opus-4-8",
    effort: "high",
  });
  // HOU-695: the pick pins THIS turn only. Writing it to the agent-wide
  // settings would move every other conversation's fallback provider.
  expect(calls.settings).toEqual([]);
});

test("an effort-only pick never lists providers (no model to resolve)", async () => {
  const { commands, calls, vm } = harness();
  await commands.get("turns/send")?.({
    conversationId: "c1",
    text: "hi",
    effort: "high",
  });
  await waitFor(() => vm()?.sessionStatus === "completed");
  expect(calls.providersListed).toBe(0);
  expect(calls.settings).toEqual([]);
  expect(calls.sendOpts[0]).toMatchObject({ effort: "high" });
  expect((calls.sendOpts[0] as { provider?: string }).provider).toBeUndefined();
});

test("a plain send (no pick) carries no pin — the runtime resolves the conversation's provider", async () => {
  const { commands, calls, vm } = harness();
  await commands.get("turns/send")?.({ conversationId: "c1", text: "hi" });
  await waitFor(() => vm()?.sessionStatus === "completed");
  const opts = calls.sendOpts[0] as {
    provider?: string;
    model?: string;
    effort?: string;
  };
  expect(opts.provider).toBeUndefined();
  expect(opts.model).toBeUndefined();
  expect(opts.effort).toBeUndefined();
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

test("observe replays the running turn's thinking + tools from the sync, deduped across a resync (HOU-717)", async () => {
  const activityTurn: WireFrame[] = [
    {
      type: "sync",
      data: {
        running: true,
        partial: "",
        seq: 2,
        thinking: "planning the steps",
        tools: [
          { name: "bash", input: { cmd: "ls" }, isError: false, content: "ok" },
          { name: "read", input: { path: "a.txt" } }, // still running
        ],
      },
      seq: 2,
    },
    // Reconnect resync: same activity again (must NOT double), and the
    // still-running tool has since ended (its result must land).
    {
      type: "sync",
      data: {
        running: true,
        partial: "",
        seq: 3,
        resync: true,
        thinking: "planning the steps",
        tools: [
          { name: "bash", input: { cmd: "ls" }, isError: false, content: "ok" },
          {
            name: "read",
            input: { path: "a.txt" },
            isError: false,
            content: "the file body",
          },
        ],
      },
      seq: 3,
    },
    { type: "text", data: "observed reply", seq: 4 },
    { type: "done", data: null, seq: 5 },
  ];
  const { mod, vm } = harness(activityTurn);
  await mod.observe("c1");
  await waitFor(() => vm()?.sessionStatus === "completed");
  const feed = vm().feed;
  const thinking = feed.filter((f) => f.feed_type === "thinking");
  expect(thinking).toHaveLength(1);
  expect(thinking[0].data).toBe("planning the steps");
  const calls = feed.filter((f) => f.feed_type === "tool_call");
  expect(calls.map((f) => f.data)).toEqual([
    { name: "bash", input: { cmd: "ls" } },
    { name: "read", input: { path: "a.txt" } },
  ]);
  // Both results landed exactly once, carrying their output previews.
  const results = feed.filter((f) => f.feed_type === "tool_result");
  expect(results.map((f) => f.data)).toEqual([
    { content: "ok", is_error: false },
    { content: "the file body", is_error: false },
  ]);
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
