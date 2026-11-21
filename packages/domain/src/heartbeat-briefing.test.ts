import { describe, expect, test } from "vitest";
import {
  loadHeartbeat,
  loadHeartbeatDoc,
  normalizeHeartbeat,
} from "./heartbeat";
import {
  recordHeartbeatAdmitted,
  settleHeartbeatRun,
} from "./heartbeat-briefing";
import type { TextStore } from "./store";

const RUN = "2026-10-10T08:30:00.000Z";
const DONE = "2026-10-10T08:32:00.000Z";

function memoryStore(): TextStore {
  const files = new Map<string, string>();
  return {
    readText: async (key) => files.get(key) ?? null,
    writeText: async (key, content) => {
      files.set(key, content);
    },
  };
}

const admit = (store: TextStore, seen: string[]) =>
  recordHeartbeatAdmitted(store, "P", {
    date: "2026-10-10",
    at: RUN,
    nonce: "heartbeat-1",
    seen,
  });

describe("a briefing's two moments", () => {
  test("admission claims the day but leaves seen alone", async () => {
    const store = memoryStore();
    await admit(store, ["need:Ana/m1"]);
    const doc = await loadHeartbeatDoc(store, "P");
    expect(doc.last).toEqual({
      status: "delivered",
      date: "2026-10-10",
      at: RUN,
    });
    expect(doc.pending).toEqual({
      nonce: "heartbeat-1",
      at: RUN,
      seen: ["need:Ana/m1"],
    });
    expect(doc.seen).toEqual([]);
    expect(Object.keys(await loadHeartbeat(store, "P")).sort()).toEqual([
      "enabled",
      "last",
      "time",
    ]);
  });

  test("finishing makes the briefing's keys the seen set", async () => {
    const store = memoryStore();
    await admit(store, ["need:Ana/m1"]);
    await settleHeartbeatRun(store, "P", {
      kind: "completed",
      nonce: "heartbeat-1",
      at: DONE,
    });
    expect(await loadHeartbeatDoc(store, "P")).toMatchObject({
      seen: ["need:Ana/m1"],
      pending: null,
    });
  });

  test("failing reads as an error and leaves seen alone", async () => {
    const store = memoryStore();
    await admit(store, ["need:Ana/m1"]);
    await settleHeartbeatRun(store, "P", {
      kind: "failed",
      nonce: "heartbeat-1",
      at: DONE,
      reason: "overloaded",
    });
    const doc = await loadHeartbeatDoc(store, "P");
    expect(doc.last).toEqual({
      status: "error",
      date: "2026-10-10",
      at: DONE,
      reason: "overloaded",
    });
    expect(doc).toMatchObject({ seen: [], pending: null });
  });

  test("settling twice is a no-op the second time", async () => {
    const store = memoryStore();
    await admit(store, []);
    expect(
      await settleHeartbeatRun(store, "P", {
        kind: "completed",
        nonce: "heartbeat-1",
        at: DONE,
      }),
    ).not.toBeNull();
    expect(
      await settleHeartbeatRun(store, "P", {
        kind: "completed",
        nonce: "heartbeat-1",
        at: DONE,
      }),
    ).toBeNull();
  });

  test("an outcome read for one briefing never lands on a newer one", async () => {
    const store = memoryStore();
    await admit(store, ["need:W/Ana/m1"]);
    await recordHeartbeatAdmitted(store, "P", {
      date: "2026-10-10",
      at: DONE,
      nonce: "heartbeat-2",
      seen: ["need:W/Ana/m2"],
    });
    expect(
      await settleHeartbeatRun(store, "P", {
        kind: "completed",
        nonce: "heartbeat-1",
        at: DONE,
      }),
    ).toBeNull();
    const doc = await loadHeartbeatDoc(store, "P");
    expect(doc.pending?.nonce).toBe("heartbeat-2");
    expect(doc.seen).toEqual([]);
  });

  test("a document without seen reads as empty; junk entries are dropped", () => {
    expect(normalizeHeartbeat({ lastDeliveredAt: RUN }).seen).toEqual([]);
    expect(normalizeHeartbeat({ seen: ["a", 3, null] }).seen).toEqual(["a"]);
    expect(normalizeHeartbeat({ pending: { at: RUN } }).pending).toBeNull();
  });
});
