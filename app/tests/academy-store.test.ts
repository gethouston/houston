import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type AcademyMutationQueue,
  createAcademyMutationQueue,
  createAcademyQueues,
  UNKNOWN_DEVICE_ID,
} from "../src/lib/academy/academy-mutations.ts";
import {
  ACADEMY_PREF_KEY,
  type AcademyRecord,
  completeChapterRecord,
  completeLessonRecord,
  serializeAcademyRecord,
  totalExperience,
  totalUsagePoints,
} from "../src/lib/academy/academy-record.ts";
import { parseAcademyRecord } from "../src/lib/academy/academy-record-parse.ts";
import {
  type AcademyDevice,
  type AcademyStorePorts,
  academyLocalKey,
  academyPortsFor,
  loadAcademyRecord,
  saveAcademyRecord,
} from "../src/lib/academy/academy-store.ts";
import { accrueUsage } from "../src/lib/academy/usage-points.ts";

// The store logs the engine-write failures it deliberately swallows.
console.error = () => {};

const DEVICE = "install-1";
const UID = "userA";

interface Harness {
  /** Ports for {@link UID}, wired exactly as the live ones are. */
  ports: AcademyStorePorts;
  /** A queue over those ports, as every award path uses. */
  queue: AcademyMutationQueue;
  /** The preference store of one account — the engine only ever serves one. */
  engineOf: (uid: string | null) => Map<string, string>;
  engine: Map<string, string>;
  mirrorOf: (uid: string | null) => AcademyRecord | null;
  mirror: () => AcademyRecord | null;
  /** Put a record on the device without going through the store. */
  setMirror: (value: AcademyRecord) => void;
  /** Every value handed to the preference store, successful or not. */
  writes: string[];
  /** Flip the whole preference store between healthy and "pod is waking". */
  setEngineDown: (down: boolean) => void;
  /** Sign a different account in — the engine follows it, the mirrors do not. */
  setActiveUid: (uid: string | null) => void;
  /** Hold every engine read/write until the returned release is called. */
  gate: () => () => void;
}

function harness(opts?: { engineDown?: boolean }): Harness {
  const engines = new Map<string | null, Map<string, string>>();
  const local = new Map<string, string>();
  const writes: string[] = [];
  let down = opts?.engineDown ?? false;
  let active: string | null = UID;
  let held: Array<() => void> | null = null;

  const engineOf = (uid: string | null) => {
    const found = engines.get(uid);
    if (found) return found;
    const fresh = new Map<string, string>();
    engines.set(uid, fresh);
    return fresh;
  };
  const wait = () =>
    held === null
      ? Promise.resolve()
      : new Promise<void>((resolve) => held?.push(resolve));

  const device: AcademyDevice = {
    getPreference: async (key) => {
      await wait();
      if (down) throw new Error("pod is still waking");
      return engineOf(active).get(key) ?? null;
    },
    setPreference: async (key, value) => {
      await wait();
      writes.push(value);
      if (down) throw new Error("pod is still waking");
      engineOf(active).set(key, value);
    },
    readLocal: (key) => local.get(key) ?? null,
    writeLocal: (key, value) => {
      local.set(key, value);
    },
  };

  const ports = academyPortsFor(device, UID, () => active);
  const mirrorOf = (uid: string | null) =>
    parseAcademyRecord(local.get(academyLocalKey(uid)) ?? null);
  return {
    ports,
    queue: createAcademyMutationQueue(ports, () => DEVICE),
    engineOf,
    engine: engineOf(UID),
    mirrorOf,
    mirror: () => mirrorOf(UID),
    setMirror: (value) => {
      local.set(academyLocalKey(UID), serializeAcademyRecord(value));
    },
    writes,
    setEngineDown: (isDown) => {
      down = isDown;
    },
    setActiveUid: (uid) => {
      active = uid;
    },
    gate: () => {
      held = [];
      return () => {
        const waiting = held ?? [];
        held = null;
        for (const release of waiting) release();
      };
    },
  };
}

const record = (patch: Partial<AcademyRecord> = {}): AcademyRecord => ({
  version: 1,
  chapters: {
    setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
  },
  lessons: {},
  usageByDevice: {},
  usageDay: null,
  usageToday: 0,
  streak: { current: 0, best: 0, lastActiveDay: null },
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...patch,
});

/** The record half of a load. Whether the ENGINE was reached is the Academy
 *  screen's business — that half is driven in `academy-error-state.test.ts`. */
const loadRecord = async (ports: AcademyStorePorts) =>
  (await loadAcademyRecord(ports)).record;

/** Let the store's non-blocking engine heal settle before asserting on it. */
const settle = () => new Promise((r) => setImmediate(r));

const now = new Date("2026-08-10T12:00:00.000Z");

const award =
  (id: string, xp: number, at = now) =>
  (r: AcademyRecord | null): AcademyRecord =>
    completeChapterRecord(r, id, xp, at);

const teach =
  (id: string, xp: number, at = now) =>
  (r: AcademyRecord | null): AcademyRecord =>
    completeLessonRecord(r, id, xp, at);

const pay =
  (points: number, at = now) =>
  (r: AcademyRecord | null, deviceId: string): AcademyRecord | null =>
    accrueUsage(r, points, at, deviceId);

describe("loadAcademyRecord", () => {
  it("returns null when neither copy exists", async () => {
    const h = harness();
    strictEqual(await loadRecord(h.ports), null);
  });

  it("merges the preference and the mirror, then heals both", async () => {
    const h = harness();
    h.engine.set(
      ACADEMY_PREF_KEY,
      serializeAcademyRecord(
        record({
          usageByDevice: { "install-2": 300 },
          updatedAt: "2026-08-04T10:00:00.000Z",
        }),
      ),
    );
    h.setMirror(
      record({
        chapters: {
          basics: { completedAt: "2026-08-02T10:00:00.000Z", experience: 100 },
        },
        usageByDevice: { [DEVICE]: 10 },
      }),
    );

    const merged = await loadRecord(h.ports);
    strictEqual(totalExperience(merged), 150);
    strictEqual(totalUsagePoints(merged), 310);
    // Self-heal: the mirror AND the engine now hold the merged record.
    deepStrictEqual(h.mirror(), merged);
    await settle();
    deepStrictEqual(
      parseAcademyRecord(h.engine.get(ACADEMY_PREF_KEY) ?? null),
      merged,
    );
  });

  it("heals the mirror from the preference when the device has nothing", async () => {
    const h = harness();
    const stored = record();
    h.engine.set(ACADEMY_PREF_KEY, serializeAcademyRecord(stored));
    deepStrictEqual(await loadRecord(h.ports), stored);
    deepStrictEqual(h.mirror(), stored);
  });

  it("falls back to the mirror when the preference read fails", async () => {
    const h = harness({ engineDown: true });
    const earned = record({ usageByDevice: { [DEVICE]: 42 } });
    h.setMirror(earned);

    deepStrictEqual(await loadRecord(h.ports), earned);
    await settle();
    // An UNREAD engine is not an empty one: nothing was pushed over it.
    strictEqual(h.writes.length, 0);
  });

  it("does not downgrade the mirror when the preference is corrupt", async () => {
    const h = harness();
    const earned = record({ usageByDevice: { [DEVICE]: 42 } });
    h.setMirror(earned);
    h.engine.set(ACADEMY_PREF_KEY, "{ not a record");

    deepStrictEqual(await loadRecord(h.ports), earned);
    await settle();
    deepStrictEqual(
      parseAcademyRecord(h.engine.get(ACADEMY_PREF_KEY) ?? null),
      earned,
    );
  });
});

describe("saveAcademyRecord", () => {
  it("writes the mirror even when the engine write fails", async () => {
    const h = harness({ engineDown: true });
    const earned = record();
    await saveAcademyRecord(h.ports, earned);
    deepStrictEqual(h.mirror(), earned);
    strictEqual(h.engine.get(ACADEMY_PREF_KEY), undefined);
  });
});

/**
 * The engine preference store serves whoever is authenticated, and only the
 * mirror is keyed by uid. Every engine call must therefore re-check the account
 * or one user's progress lands in another user's preference.
 */
describe("academyPortsFor — the account that earned it", () => {
  it("never writes one account's record into another's preference", async () => {
    const h = harness();
    await h.queue.run(pay(3));
    strictEqual(totalUsagePoints(h.mirror()), 3);

    // The user signs out and somebody else signs in; the buffered flush for the
    // first account lands afterwards.
    h.setActiveUid("userB");
    await h.queue.run(pay(2));

    strictEqual(h.engineOf("userB").get(ACADEMY_PREF_KEY), undefined);
    strictEqual(h.mirrorOf("userB"), null);
    // The points still belong to the account that earned them, on this device.
    strictEqual(totalUsagePoints(h.mirror()), 5);
  });

  it("never reads another account's record into this one", async () => {
    const h = harness();
    h.engineOf("userB").set(
      ACADEMY_PREF_KEY,
      serializeAcademyRecord(
        record({
          chapters: {
            stranger: {
              completedAt: "2026-08-01T10:00:00.000Z",
              experience: 500,
            },
          },
        }),
      ),
    );
    h.setActiveUid("userB");

    strictEqual(await loadRecord(h.ports), null);
  });

  it("refuses an engine answer that arrived after the account changed", async () => {
    const h = harness();
    h.engineOf("userB").set(
      ACADEMY_PREF_KEY,
      serializeAcademyRecord(record({ usageByDevice: { "install-b": 900 } })),
    );
    const release = h.gate();
    const reading = loadRecord(h.ports);
    h.setActiveUid("userB"); // signed out while the read was in flight
    release();

    strictEqual(await reading, null);
  });

  it("heals the engine on the next sign-in of the account that earned it", async () => {
    const h = harness();
    h.setActiveUid("userB");
    await h.queue.run(pay(4));
    strictEqual(h.engine.get(ACADEMY_PREF_KEY), undefined);

    h.setActiveUid(UID);
    const healed = await loadRecord(h.ports);
    strictEqual(totalUsagePoints(healed), 4);
    await settle();
    strictEqual(
      totalUsagePoints(
        parseAcademyRecord(h.engine.get(ACADEMY_PREF_KEY) ?? null),
      ),
      4,
    );
  });
});

describe("the mutation queue — awards", () => {
  it("awards a chapter and persists it to both copies", async () => {
    const h = harness();
    const next = await h.queue.run(award("setup", 50));
    strictEqual(totalExperience(next), 50);
    deepStrictEqual(h.mirror(), next);
    deepStrictEqual(
      parseAcademyRecord(h.engine.get(ACADEMY_PREF_KEY) ?? null),
      next,
    );
  });

  it("is idempotent: a second call pays nothing and writes nothing", async () => {
    const h = harness();
    const first = await h.queue.run(award("setup", 50));
    const writesAfterFirst = h.writes.length;

    const again = await h.queue.run(
      award("setup", 50, new Date("2026-09-01T12:00:00.000Z")),
    );
    strictEqual(totalExperience(again), 50);
    strictEqual(again.chapters.setup?.completedAt, now.toISOString());
    deepStrictEqual(again, first);
    strictEqual(h.writes.length, writesAfterFirst);
  });

  it("awards a lesson beside the chapters, once", async () => {
    const h = harness();
    const first = await h.queue.run(teach("intro", 10));
    strictEqual(totalExperience(first), 10);
    deepStrictEqual(h.mirror(), first);

    const writesAfterFirst = h.writes.length;
    const again = await h.queue.run(teach("intro", 10));
    deepStrictEqual(again, first);
    strictEqual(h.writes.length, writesAfterFirst);
  });

  it("keeps the award when the engine is unreachable, and heals later", async () => {
    const h = harness({ engineDown: true });
    const earned = await h.queue.run(award("setup", 50));
    ok(earned.chapters.setup);
    strictEqual(h.engine.get(ACADEMY_PREF_KEY), undefined);

    h.setEngineDown(false);
    const healed = await loadRecord(h.ports);
    deepStrictEqual(healed, earned);
    await settle();
    deepStrictEqual(
      parseAcademyRecord(h.engine.get(ACADEMY_PREF_KEY) ?? null),
      earned,
    );
  });

  it("pays usage points, and writes nothing once the day is capped", async () => {
    const h = harness();
    await h.queue.run(pay(20));
    strictEqual(totalUsagePoints(h.mirror()), 20);
    const writesAfterCap = h.writes.length;

    // A capped accrual hands back the record it read, untouched.
    strictEqual(totalUsagePoints(await h.queue.run(pay(2))), 20);
    strictEqual(h.writes.length, writesAfterCap);
  });
});

/**
 * Chapters, lessons and usage points are three read-modify-writes over ONE
 * record. Un-serialized, two of them read the same copy and the second saves
 * over the first — the award the user just earned, gone.
 */
describe("the mutation queue — one writer", () => {
  it("keeps every award when three paths fire together", async () => {
    const h = harness();
    const release = h.gate();
    const all = Promise.all([
      h.queue.run(award("setup", 50)),
      h.queue.run(teach("intro", 10)),
      h.queue.run(pay(2)),
    ]);
    // Every engine read resumes in the same turn: without a queue all three
    // would load the same empty record and the last write would win.
    release();
    await all;

    const stored = h.mirror();
    strictEqual(totalExperience(stored), 60);
    strictEqual(totalUsagePoints(stored), 2);
    deepStrictEqual(
      parseAcademyRecord(h.engine.get(ACADEMY_PREF_KEY) ?? null),
      stored,
    );
  });

  it("serializes a burst of accruals so no point is overwritten", async () => {
    const h = harness();
    const release = h.gate();
    const all = Promise.all([
      h.queue.run(pay(1)),
      h.queue.run(pay(1)),
      h.queue.run(pay(2)),
    ]);
    release();
    await all;

    const stored = await loadRecord(h.ports);
    strictEqual(totalUsagePoints(stored), 4);
    strictEqual(stored?.usageToday, 4);
  });

  it("keeps running after a failed mutation", async () => {
    const h = harness();
    await h.queue
      .run(() => {
        throw new Error("nope");
      })
      .catch(() => undefined);
    await h.queue.run(pay(3));

    strictEqual(totalUsagePoints(await loadRecord(h.ports)), 3);
  });

  it("folds in a record another window saved while the slot was loading", async () => {
    const h = harness();
    const release = h.gate();
    const awarding = h.queue.run(award("setup", 50));
    // A second window (its own queue, same mirror) finishes a lesson meanwhile.
    h.setMirror(completeLessonRecord(null, "intro", 10, now));
    release();
    await awarding;

    strictEqual(totalExperience(h.mirror()), 60);
  });

  it("gives every award path for one account the same queue", () => {
    const built: Array<string | null> = [];
    const queues = createAcademyQueues(
      (uid) => {
        built.push(uid);
        return harness().ports;
      },
      () => DEVICE,
    );
    strictEqual(queues(UID), queues(UID));
    deepStrictEqual(built, [UID]);
    ok(queues("userB") !== queues(UID));
  });
});

/**
 * A closing window never gets its awaits back, so anything that must survive
 * the shutdown cannot be behind one.
 */
describe("the mutation queue — teardown", () => {
  it("has the mirror before the engine has answered anything", async () => {
    const h = harness();
    await h.queue.run(pay(1)); // warms the device id, as a running app would
    h.gate(); // from here the engine never answers again

    h.queue.commitSync(pay(4));

    const stored = h.mirror();
    strictEqual(totalUsagePoints(stored), 5);
    strictEqual(stored?.usageByDevice[DEVICE], 5);
  });

  it("never loses what the mirror already held", () => {
    const h = harness();
    h.setMirror(record());
    h.gate();

    h.queue.commitSync(pay(4));

    const stored = h.mirror();
    strictEqual(totalExperience(stored), 50);
    strictEqual(totalUsagePoints(stored), 4);
  });

  it("credits an anonymous install when the device cannot name itself", () => {
    const h = harness();
    const queue = createAcademyMutationQueue(h.ports, () => {
      throw new Error("storage disabled");
    });
    queue.commitSync(pay(4));
    strictEqual(h.mirror()?.usageByDevice[UNKNOWN_DEVICE_ID], 4);
  });

  it("pays once when the window says goodbye twice", async () => {
    // The flush now runs on `pagehide` AND on the window going hidden, so a
    // user who cmd-tabs away and then quits reaches it twice. An award already
    // applied must cost nothing the second time.
    const h = harness();
    h.queue.commitSync(award("setup", 50));
    const writesAfterFirst = h.writes.length;

    h.queue.commitSync(award("setup", 50));
    strictEqual(totalExperience(h.mirror()), 50);
    strictEqual(h.writes.length, writesAfterFirst);
  });

  it("writes nothing when there is nothing left to pay", async () => {
    const h = harness();
    await h.queue.run(pay(20));
    const writesAfterCap = h.writes.length;

    h.queue.commitSync(pay(2));
    strictEqual(totalUsagePoints(h.mirror()), 20);
    strictEqual(h.writes.length, writesAfterCap);
  });
});
