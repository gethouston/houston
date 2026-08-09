import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createOnboardingSurveyPreference,
  type OnboardingSurveyPreference,
} from "../src/lib/onboarding-survey.ts";
import {
  createSurveyPusher,
  type SurveyPusher,
} from "../src/lib/onboarding-survey-push.ts";
import { owesGatewayCatchUp } from "../src/lib/onboarding-sync.ts";

const STAMP = "2026-08-08T12:00:00.000Z";

/** Let everything already scheduled run: after one of these, a push handed to
 *  the pusher has reached the gateway (or is provably waiting its turn). */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A record carrying ONE answer, with its `updatedAt` pinned so two revisions
 *  made in the same millisecond still read as two different records. */
const answered = (
  goal: string,
  updatedAt: string,
): OnboardingSurveyPreference => ({
  ...createOnboardingSurveyPreference(),
  automationGoal: goal,
  updatedAt,
  gatewaySyncedAt: null,
});

interface Harness {
  pusher: SurveyPusher;
  /** Order the account store RECEIVED each push, by its answer. */
  sent: string[];
  /** Order the account store COMMITTED each push. */
  applied: string[];
  /** Most pushes in flight at once — 1 means they never overlapped. */
  peak: () => number;
  /** The answer the account store ended up holding. */
  stored: () => string | null;
  /** The record this device holds (the query cache stand-in). */
  device: () => OnboardingSurveyPreference | null;
  /** A save: what the hook does before it flushes. */
  save: (record: OnboardingSurveyPreference) => void;
  /** Every record the push wrote back to the device. */
  writes: OnboardingSurveyPreference[];
  /** Hold this answer's PUT open until {@link Harness.land}. */
  hold: (goal: string) => void;
  /** Settle a held PUT — `false` is a push the gateway refused. */
  land: (goal: string, ok?: boolean) => void;
}

function harness(opts?: { gateway?: boolean }): Harness {
  const sent: string[] = [];
  const applied: string[] = [];
  const writes: OnboardingSurveyPreference[] = [];
  const held = new Map<string, (ok: boolean) => void>();
  const gates = new Map<string, Promise<boolean>>();
  let device: OnboardingSurveyPreference | null = null;
  let stored: string | null = null;
  let inFlight = 0;
  let peak = 0;

  const pusher = createSurveyPusher({
    gateway: opts?.gateway ?? true,
    readRecord: () => device,
    writeRecord: async (record) => {
      writes.push(record);
      device = record;
    },
    put: async (patch) => {
      const goal = String(patch.automationGoal ?? patch.segment ?? "?");
      sent.push(goal);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        const ok = await (gates.get(goal) ?? Promise.resolve(true));
        if (ok) {
          stored = goal;
          applied.push(goal);
        }
        return ok;
      } finally {
        inFlight -= 1;
      }
    },
    now: () => STAMP,
  });

  return {
    pusher,
    sent,
    applied,
    writes,
    peak: () => peak,
    stored: () => stored,
    device: () => device,
    save: (record) => {
      pusher.claim(record);
      device = record;
    },
    hold: (goal) => {
      gates.set(
        goal,
        new Promise<boolean>((resolve) => held.set(goal, resolve)),
      );
    },
    land: (goal, landed = true) => {
      held.get(goal)?.(landed);
    },
  };
}

describe("pushes to the account store never overlap", () => {
  it("keeps the user's LAST answer as the gateway's last write", async () => {
    // The divergence this serializes away: the user answers the goal (PUT "a"
    // held open by a waking pod), presses Back, and answers again (PUT "b").
    // Sent concurrently, "b" lands first and "a" lands LAST — the gateway keeps
    // the answer the user replaced while this device stamps "b" as synced, and
    // nothing ever repairs it (`owesGatewayCatchUp` skips a stamped record and
    // the gateway merge only fills local gaps).
    const h = harness();
    const first = answered("a", "2026-08-08T11:00:00.000Z");
    const second = answered("b", "2026-08-08T11:00:01.000Z");
    h.hold("a");
    h.hold("b");

    h.save(first);
    const flushFirst = h.pusher.flush(first);
    await settle();
    deepStrictEqual(h.sent, ["a"]); // the pod is holding it open

    h.save(second);
    const flushSecond = h.pusher.flush(second);
    await settle();

    // The pod answers the SECOND request first — which it can only do if the
    // second request was ever in flight beside the first.
    h.land("b");
    h.land("a");
    await Promise.all([flushFirst, flushSecond]);

    strictEqual(h.peak(), 1);
    deepStrictEqual(h.sent, ["a", "b"]);
    deepStrictEqual(h.applied, ["a", "b"]);
    strictEqual(h.stored(), "b");
    // …and the stamp the device holds is TRUE of what the gateway holds.
    strictEqual(h.device()?.automationGoal, "b");
    strictEqual(h.device()?.gatewaySyncedAt, STAMP);
    strictEqual(h.pusher.claimed(), null);
  });

  it("drops a queued push the newer one already carries", async () => {
    // Every push sends the WHOLE record, so a record superseded while it waited
    // its turn is pure noise: the newest one holds its answers too. Skipping it
    // is also what keeps a burst of answers behind a waking pod down to two
    // round trips instead of one per question.
    const h = harness();
    const first = answered("a", "2026-08-08T11:00:00.000Z");
    const second = answered("b", "2026-08-08T11:00:01.000Z");
    const third = answered("c", "2026-08-08T11:00:02.000Z");
    h.hold("a");

    h.save(first);
    const flushes = [h.pusher.flush(first)];
    await settle();
    h.save(second);
    flushes.push(h.pusher.flush(second));
    h.save(third);
    flushes.push(h.pusher.flush(third));

    h.land("a");
    await Promise.all(flushes);

    deepStrictEqual(h.sent, ["a", "c"]);
    strictEqual(h.stored(), "c");
    strictEqual(h.device()?.automationGoal, "c");
    strictEqual(h.device()?.gatewaySyncedAt, STAMP);
  });
});

describe("what a push still owes when it ends", () => {
  it("releases the claim on a push the gateway refused", async () => {
    // The release is in a `finally` precisely for this: a push that never
    // landed is what the catch-up exists for, and it is still owed a retry
    // this session.
    const h = harness();
    const record = answered("a", "2026-08-08T11:00:00.000Z");
    h.hold("a");

    h.save(record);
    const flush = h.pusher.flush(record);
    await settle();
    strictEqual(h.pusher.claimed(), record.updatedAt);

    h.land("a", false);
    await flush;

    strictEqual(h.pusher.claimed(), null);
    deepStrictEqual(h.writes, []);
    strictEqual(h.device()?.gatewaySyncedAt, null);
    // Which is exactly what the catch-up reads to know the record is owed one.
    strictEqual(
      owesGatewayCatchUp({
        survey: h.device(),
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: h.pusher.claimed(),
      }),
      true,
    );
  });

  it("releases the claim on a record with nothing to push", async () => {
    const h = harness();
    const empty = createOnboardingSurveyPreference();
    h.save(empty);
    await h.pusher.flush(empty);
    strictEqual(h.pusher.claimed(), null);
    deepStrictEqual(h.sent, []);
  });

  it("stamps nothing when a newer answer replaced the record mid-flight", async () => {
    // The local half of the same divergence: the stamp says "the gateway holds
    // THIS record", so a push that resolves after a newer save must not claim
    // it — the newer answer would read as already stored and never be sent.
    const h = harness();
    const first = answered("a", "2026-08-08T11:00:00.000Z");
    const second = answered("b", "2026-08-08T11:00:01.000Z");
    h.hold("a");

    h.save(first);
    const flush = h.pusher.flush(first);
    await settle();
    // A save that has not flushed yet (its own push is still being made).
    h.save(second);
    h.land("a");
    await flush;

    deepStrictEqual(h.writes, []);
    strictEqual(h.device()?.automationGoal, "b");
    strictEqual(h.device()?.gatewaySyncedAt, null);
    // The newer save's claim survives the older push's release.
    strictEqual(h.pusher.claimed(), second.updatedAt);
  });
});

describe("a save while the catch-up is pushing", () => {
  it("pushes each record once and leaves the newer claim standing", async () => {
    // Boot with an unsynced record: the catch-up claims it and pushes it. The
    // user answers the next question before that lands, so its save claims the
    // new record and pushes that too. Neither record may go out twice, and the
    // older push must not release the claim the newer save now owns — that
    // would let the catch-up fire a duplicate PUT of a record already in
    // flight.
    const h = harness();
    const boot = answered("a", "2026-08-08T11:00:00.000Z");
    const next = answered("b", "2026-08-08T11:00:01.000Z");
    h.hold("a");
    h.hold("b");

    // The catch-up: claims the record it found, then pushes it.
    h.save(boot);
    const catchUp = h.pusher.flush(boot);
    await settle();

    h.save(next);
    const save = h.pusher.flush(next);
    strictEqual(h.pusher.claimed(), next.updatedAt);

    h.land("a");
    await catchUp;
    // Still owned by the save whose push is in flight — no catch-up may wake.
    strictEqual(h.pusher.claimed(), next.updatedAt);
    strictEqual(
      owesGatewayCatchUp({
        survey: h.device(),
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: h.pusher.claimed(),
      }),
      false,
    );

    h.land("b");
    await save;

    deepStrictEqual(h.sent, ["a", "b"]);
    deepStrictEqual(h.applied, ["a", "b"]);
    strictEqual(h.device()?.gatewaySyncedAt, STAMP);
    strictEqual(h.pusher.claimed(), null);
  });
});

describe("a deployment with no account store", () => {
  it("claims nothing and sends nothing", async () => {
    const h = harness({ gateway: false });
    const record = answered("a", "2026-08-08T11:00:00.000Z");
    h.save(record);
    await h.pusher.flush(record);
    strictEqual(h.pusher.claimed(), null);
    deepStrictEqual(h.sent, []);
    deepStrictEqual(h.writes, []);
  });
});
