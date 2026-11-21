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

const settle = () => new Promise((resolve) => setImmediate(resolve));

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
  sent: string[];
  applied: string[];
  peak: () => number;
  stored: () => string | null;
  device: () => OnboardingSurveyPreference | null;
  save: (record: OnboardingSurveyPreference) => void;
  writes: OnboardingSurveyPreference[];
  hold: (goal: string) => void;
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
      const goal = String(patch.automationGoal ?? patch.role ?? "?");
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
    const h = harness();
    const first = answered("a", "2026-08-08T11:00:00.000Z");
    const second = answered("b", "2026-08-08T11:00:01.000Z");
    h.hold("a");
    h.hold("b");

    h.save(first);
    const flushFirst = h.pusher.flush(first);
    await settle();
    deepStrictEqual(h.sent, ["a"]);

    h.save(second);
    const flushSecond = h.pusher.flush(second);
    await settle();

    h.land("b");
    h.land("a");
    await Promise.all([flushFirst, flushSecond]);

    strictEqual(h.peak(), 1);
    deepStrictEqual(h.sent, ["a", "b"]);
    deepStrictEqual(h.applied, ["a", "b"]);
    strictEqual(h.stored(), "b");
    strictEqual(h.device()?.automationGoal, "b");
    strictEqual(h.device()?.gatewaySyncedAt, STAMP);
    strictEqual(h.pusher.claimed(), null);
  });

  it("drops a queued push the newer one already carries", async () => {
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
    const h = harness();
    const first = answered("a", "2026-08-08T11:00:00.000Z");
    const second = answered("b", "2026-08-08T11:00:01.000Z");
    h.hold("a");

    h.save(first);
    const flush = h.pusher.flush(first);
    await settle();
    h.save(second);
    h.land("a");
    await flush;

    deepStrictEqual(h.writes, []);
    strictEqual(h.device()?.automationGoal, "b");
    strictEqual(h.device()?.gatewaySyncedAt, null);
    strictEqual(h.pusher.claimed(), second.updatedAt);
  });
});

describe("a save while the catch-up is pushing", () => {
  it("pushes each record once and leaves the newer claim standing", async () => {
    const h = harness();
    const boot = answered("a", "2026-08-08T11:00:00.000Z");
    const next = answered("b", "2026-08-08T11:00:01.000Z");
    h.hold("a");
    h.hold("b");

    h.save(boot);
    const catchUp = h.pusher.flush(boot);
    await settle();

    h.save(next);
    const save = h.pusher.flush(next);
    strictEqual(h.pusher.claimed(), next.updatedAt);

    h.land("a");
    await catchUp;
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
