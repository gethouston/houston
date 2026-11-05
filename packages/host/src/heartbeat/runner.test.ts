import {
  heartbeatDocKey,
  loadHeartbeat,
  loadHeartbeatDoc,
  saveActivities,
  setPreference,
} from "@houston/domain";
import {
  AUTO_CONTINUE_MARKER,
  HEARTBEAT_MARKER,
  type HoustonEvent,
  isAutoContinue,
} from "@houston/protocol";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { conversationKey, LocalPaths } from "../paths";
import type { RuntimeChannel, WorkspaceStore } from "../ports";
import { MemoryTurnBus } from "../turn/bus";
import { MemoryVfs } from "../vfs";
import { type HeartbeatDeps, HeartbeatRunner } from "./runner";

const WS: Workspace = {
  id: "Personal",
  ownerUserId: "local-owner",
  kind: "personal",
  name: "Personal",
  slug: "Personal",
  runtime: "local",
  createdAt: 0,
};
const ANA: Agent = {
  id: "Personal/Ana",
  workspaceId: "Personal",
  name: "Ana",
  createdAt: 0,
};
const MANAGER: Agent = {
  id: "Personal/.assistant",
  workspaceId: "Personal",
  name: ".assistant",
  createdAt: 0,
};

const OTHER: Workspace = { ...WS, id: "Other", name: "Other", slug: "Other" };
const BOB: Agent = {
  ...ANA,
  id: "Other/Bob",
  workspaceId: "Other",
  name: "Bob",
};

let vfs: MemoryVfs;
let channel: {
  busy: ReturnType<typeof vi.fn>;
  fireTurn: ReturnType<typeof vi.fn>;
};
let events: HoustonEvent[];
let now: Date;
/** How the fake runtime's briefing turn ends once admitted. */
let reply: "ok" | "provider_error" | "stopped" | "none";

/** The runtime's side: the hidden message (with the sender's nonce) and its
 *  turn's reply, persisted the way the runtime does. */
async function persistTurn(
  _ctx: unknown,
  cid: string,
  text: string,
  _pin: unknown,
  opts: { nonce?: string },
) {
  const key = conversationKey(new LocalPaths(), WS, MANAGER, cid);
  const conv = JSON.parse((await vfs.readText(key)) ?? '{"messages":[]}');
  const turnId = `t${conv.messages.length}`;
  const ts = now.getTime();
  conv.messages.push({
    role: "user",
    content: text,
    ts,
    turnId,
    nonce: opts.nonce,
  });
  if (reply !== "none")
    conv.messages.push({
      role: "assistant",
      content: reply === "ok" ? "Good morning" : "",
      ts: ts + 1,
      turnId,
      ...(reply === "stopped" ? { stopped: true } : {}),
      ...(reply === "provider_error"
        ? {
            providerError: {
              kind: "unknown",
              provider: "anthropic",
              raw_excerpt: "overloaded",
            },
          }
        : {}),
    });
  await vfs.writeText(key, JSON.stringify(conv));
}

const later = (minutes: number) => {
  now = new Date(now.getTime() + minutes * 60_000);
};

function runner(over: Partial<HeartbeatDeps> = {}) {
  const store = {
    getOrCreatePersonalWorkspace: async () => WS,
    getAgent: async (id: string) => (id === MANAGER.id ? MANAGER : null),
    // The operator's every-tenant list holds a stranger's workspace the
    // briefing must never read.
    listWorkspaces: async () => [WS, OTHER],
    listWorkspacesForUser: async () => [WS],
    listAgents: async (id: string) => (id === OTHER.id ? [BOB] : [ANA]),
  } as unknown as WorkspaceStore;
  return new HeartbeatRunner({
    store,
    vfs,
    paths: new LocalPaths(),
    lock: new MemoryTurnBus(),
    channel: channel as unknown as RuntimeChannel,
    events: { emit: (_u, e) => events.push(e), subscribe: () => () => {} },
    ensureAgentDir: vi.fn(),
    userId: "local-owner",
    now: () => now,
    log: vi.fn(),
    ...over,
  });
}

/** A mission waiting on the person: a non-empty snapshot. */
const seedWaitingMission = () =>
  saveActivities(vfs, ANA.id, [
    { id: "m1", title: "Invoice", description: "", status: "needs_you" },
  ]);

beforeEach(async () => {
  vfs = new MemoryVfs();
  reply = "ok";
  channel = { busy: vi.fn(async () => false), fireTurn: vi.fn(persistTurn) };
  events = [];
  now = new Date("2026-10-10T08:30:00Z");
  await setPreference(vfs, WS.id, "timezone", "UTC");
});

describe("the daily tick", () => {
  test("not before the chosen time", async () => {
    now = new Date("2026-10-10T07:59:00Z");
    await seedWaitingMission();
    expect(await runner().tick()).toEqual({ kind: "not_due" });
    expect(channel.fireTurn).not.toHaveBeenCalled();
  });

  test("fires ONE hidden turn on the manager's conversation, once per day", async () => {
    await seedWaitingMission();
    const r = runner();
    expect(await r.tick()).toEqual({ kind: "delivered" });
    // Admitted, not yet finished: the person is not told yet.
    expect(events.map((e) => e.type)).not.toContain("HeartbeatDelivered");
    later(1);
    expect(await r.tick()).toEqual({ kind: "not_due" });
    expect(channel.fireTurn).toHaveBeenCalledTimes(1);
    const [ctx, conversation, text, pin, opts] =
      channel.fireTurn.mock.calls[0] ?? [];
    expect(ctx).toEqual({ workspace: WS, agent: MANAGER });
    expect(conversation).toBe("assistant");
    // The exact bytes the cloud gateway also sends; channels key on them.
    expect(
      text.startsWith(`${AUTO_CONTINUE_MARKER}\n\n${HEARTBEAT_MARKER}\n`),
    ).toBe(true);
    expect(text).toContain("This is your automatic morning check-in.");
    expect(isAutoContinue(text)).toBe(true);
    expect(text).toContain('Ana: "Invoice"');
    expect(text).toContain("2026-10-10, 08:30");
    expect(pin).toEqual({ mode: "auto" });
    expect(opts).toEqual({
      actingUser: "local-owner",
      nonce: expect.stringMatching(/^heartbeat-/),
    });
    expect((await loadHeartbeat(vfs, WS.id)).last).toMatchObject({
      status: "delivered",
      date: "2026-10-10",
    });
    expect(events).toContainEqual({
      type: "HeartbeatDelivered",
      agentPath: MANAGER.id,
      date: "2026-10-10",
    });
  });

  test("never into a running turn, and nothing is recorded", async () => {
    await seedWaitingMission();
    channel.busy.mockResolvedValue(true);
    expect(await runner().tick()).toEqual({ kind: "busy" });
    expect(channel.fireTurn).not.toHaveBeenCalled();
    expect(await vfs.readText(heartbeatDocKey(WS.id))).toBeNull();
  });

  test("an empty snapshot is quiet: no model call, no notification", async () => {
    expect(await runner().tick()).toEqual({ kind: "quiet" });
    expect(channel.fireTurn).not.toHaveBeenCalled();
    expect((await loadHeartbeat(vfs, WS.id)).last?.status).toBe("quiet");
    expect(events.map((e) => e.type)).toEqual(["HeartbeatChanged"]);
  });

  test("a refused turn records the reason and waits for tomorrow", async () => {
    await seedWaitingMission();
    channel.fireTurn.mockRejectedValue(new Error("no provider connected"));
    const log = vi.fn();
    const r = runner({ log });
    expect(await r.tick()).toEqual({
      kind: "error",
      reason: "no provider connected",
    });
    expect(log).toHaveBeenCalled();
    expect((await loadHeartbeat(vfs, WS.id)).last).toMatchObject({
      status: "error",
      reason: "no provider connected",
    });
    expect(await r.tick()).toEqual({ kind: "not_due" });
    expect(events.map((e) => e.type)).not.toContain("HeartbeatDelivered");
  });

  test("two replicas sharing a lock never both fire the same date", async () => {
    await seedWaitingMission();
    const lock = new MemoryTurnBus();
    const [a, b] = await Promise.all([
      runner({ lock }).tick(),
      runner({ lock }).tick(),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(["delivered", "locked"]);
    expect(channel.fireTurn).toHaveBeenCalledTimes(1);
  });

  test("reads only the person's own workspaces", async () => {
    await saveActivities(vfs, BOB.id, [
      { id: "b1", title: "Secret", description: "", status: "needs_you" },
    ]);
    expect(await runner().tick()).toEqual({ kind: "quiet" });
    expect(channel.fireTurn).not.toHaveBeenCalled();
  });

  test("a snapshot that throws leaves today unclaimed for the next tick", async () => {
    await seedWaitingMission();
    const lock = new MemoryTurnBus();
    const store = {
      getOrCreatePersonalWorkspace: async () => WS,
      getAgent: async (id: string) => (id === MANAGER.id ? MANAGER : null),
      listWorkspacesForUser: async () => [WS],
      listAgents: vi
        .fn()
        .mockRejectedValueOnce(new Error("disk hiccup"))
        .mockResolvedValue([ANA]),
    } as unknown as WorkspaceStore;
    const r = runner({ lock, store });
    await expect(r.tick()).rejects.toThrow("disk hiccup");
    expect(await r.tick()).toEqual({ kind: "delivered" });
    expect(channel.fireTurn).toHaveBeenCalledTimes(1);
  });

  test("the person's timezone decides the local day", async () => {
    await setPreference(vfs, WS.id, "timezone", "America/Los_Angeles");
    await seedWaitingMission();
    // 08:30 UTC is 01:30 in Los Angeles: not yet morning there.
    expect(await runner().tick()).toEqual({ kind: "not_due" });
  });
});

describe("only when there is news", () => {
  const nextMorning = () => {
    now = new Date(now.getTime() + 86_400_000);
  };

  test("the same waiting mission the next day is quiet", async () => {
    await saveActivities(vfs, ANA.id, [
      {
        id: "m1",
        title: "Invoice",
        description: "",
        status: "needs_you",
        updated_at: "2026-10-10T06:00:00.000Z",
      },
    ]);
    const r = runner();
    expect(await r.tick()).toEqual({ kind: "delivered" });
    nextMorning();
    expect(await r.tick()).toEqual({ kind: "quiet" });
    expect(channel.fireTurn).toHaveBeenCalledTimes(1);
    // A mission the person has not been told about is news.
    await saveActivities(vfs, ANA.id, [
      {
        id: "m2",
        title: "Report",
        description: "",
        status: "done",
        updated_at: "2026-10-10T12:00:00.000Z",
      },
    ]);
    nextMorning();
    expect(await r.tick()).toEqual({ kind: "delivered" });
    const text: string = channel.fireTurn.mock.calls[1]?.[2];
    expect(text).toContain('Ana: "Report"');
  });

  test("a failed day keeps the window open from the last delivery", async () => {
    await seedWaitingMission();
    const r = runner();
    channel.fireTurn.mockRejectedValueOnce(new Error("quota"));
    expect((await r.tick()).kind).toBe("error");
    nextMorning();
    // Never delivered: the first briefing still counts any item.
    expect(await r.tick()).toEqual({ kind: "delivered" });
  });
});

describe("an admitted briefing counts once its turn finishes", () => {
  const nextMorning = () => later(24 * 60);

  test("each fire carries a nonce its user message keeps", async () => {
    await seedWaitingMission();
    await runner().tick();
    const opts = channel.fireTurn.mock.calls[0]?.[4];
    expect(opts.nonce).toMatch(/^heartbeat-/);
    expect((await loadHeartbeatDoc(vfs, WS.id)).pending?.nonce).toBe(
      opts.nonce,
    );
  });

  test.each([
    ["provider_error", "overloaded"],
    ["stopped", "the briefing turn was stopped"],
    ["none", "the briefing turn ended without a reply"],
  ] as const)("a turn that ends %s tells nobody and leaves seen alone", async (how, reason) => {
    await seedWaitingMission();
    reply = how;
    const r = runner();
    expect(await r.tick()).toEqual({ kind: "delivered" });
    later(1);
    expect(await r.tick()).toEqual({ kind: "not_due" });
    const doc = await loadHeartbeatDoc(vfs, WS.id);
    expect(doc.last).toMatchObject({ status: "error", reason });
    expect(doc.seen).toEqual([]);
    expect(doc.pending).toBeNull();
    expect(events.map((e) => e.type)).not.toContain("HeartbeatDelivered");
    // The same, unchanged mission is told the next morning.
    reply = "ok";
    nextMorning();
    expect(await r.tick()).toEqual({ kind: "delivered" });
    expect(channel.fireTurn).toHaveBeenCalledTimes(2);
  });

  test("a turn still running stays pending, then settles once", async () => {
    await seedWaitingMission();
    const r = runner();
    await r.tick();
    channel.busy.mockResolvedValue(true);
    later(1);
    await r.tick();
    expect((await loadHeartbeatDoc(vfs, WS.id)).pending).not.toBeNull();
    channel.busy.mockResolvedValue(false);
    later(1);
    await r.tick();
    later(1);
    await r.tick();
    const doc = await loadHeartbeatDoc(vfs, WS.id);
    expect(doc.pending).toBeNull();
    expect(doc.seen).toEqual(["need:Personal/Ana/m1"]);
    expect(events.filter((e) => e.type === "HeartbeatDelivered")).toHaveLength(
      1,
    );
  });
});

describe("brief me now", () => {
  test.each([
    "tick",
    "runNow",
  ] as const)("%s reads the suggestion setting for each briefing", async (method) => {
    await seedWaitingMission();
    await setPreference(vfs, WS.id, "next_step_suggestions", "false");
    const r = runner();
    expect(await r[method]()).toEqual({ kind: "delivered" });
    expect(channel.fireTurn.mock.calls[0]?.[2]).not.toContain(
      "suggest_actions",
    );
    expect(channel.fireTurn.mock.calls[0]?.[2]).toContain(
      "5. End with a short closing line",
    );
    await setPreference(vfs, WS.id, "next_step_suggestions", "true");
    expect(await r.runNow()).toEqual({ kind: "delivered" });
    expect(channel.fireTurn.mock.calls[1]?.[2]).toContain(
      "5. End with suggest_actions",
    );
  });

  test("ignores the time, today's run and the news rule, still honours the busy guard", async () => {
    now = new Date("2026-10-10T03:00:00Z");
    await seedWaitingMission();
    const r = runner();
    expect(await r.runNow()).toEqual({ kind: "delivered" });
    expect(await r.runNow()).toEqual({ kind: "delivered" });
    channel.busy.mockResolvedValue(true);
    expect(await r.runNow()).toEqual({ kind: "busy" });
    expect(channel.fireTurn).toHaveBeenCalledTimes(2);
  });

  test("answers quiet when nothing needs saying", async () => {
    expect(await runner().runNow()).toEqual({ kind: "quiet" });
  });
});
