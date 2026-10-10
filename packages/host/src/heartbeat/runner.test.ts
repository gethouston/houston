import {
  heartbeatDocKey,
  loadHeartbeat,
  saveActivities,
  setPreference,
} from "@houston/domain";
import { AUTO_CONTINUE_MARKER, type HoustonEvent } from "@houston/protocol";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
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
  channel = { busy: vi.fn(async () => false), fireTurn: vi.fn(async () => {}) };
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
    expect(await r.tick()).toEqual({ kind: "not_due" });
    expect(channel.fireTurn).toHaveBeenCalledTimes(1);
    const [ctx, conversation, text, pin, opts] =
      channel.fireTurn.mock.calls[0] ?? [];
    expect(ctx).toEqual({ workspace: WS, agent: MANAGER });
    expect(conversation).toBe("assistant");
    expect(text.startsWith(AUTO_CONTINUE_MARKER)).toBe(true);
    expect(text).toContain('Ana: "Invoice"');
    expect(text).toContain("2026-10-10, 08:30");
    expect(pin).toEqual({ mode: "auto" });
    expect(opts).toEqual({ actingUser: "local-owner" });
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

describe("brief me now", () => {
  test("ignores the time and today's run, still honours the busy guard", async () => {
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
