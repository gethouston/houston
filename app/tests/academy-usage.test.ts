import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import { UNKNOWN_DEVICE_ID } from "../src/lib/academy/academy-mutations.ts";
import {
  type AcademyRecord,
  totalUsagePoints,
} from "../src/lib/academy/academy-record.ts";
import {
  USAGE_DEVICE_KEY,
  usageDeviceId,
} from "../src/lib/academy/usage-device.ts";
import {
  accrueUsage,
  liveStreak,
  USAGE_DAILY_CAP,
  USAGE_POINT_EVENTS,
  usageDayStamp,
  usagePointsFor,
} from "../src/lib/academy/usage-points.ts";

/** Built from LOCAL parts on purpose: a user's day is their day, so every
 *  boundary in these tests must hold in whatever timezone CI runs in. */
const at = (year: number, month: number, day: number, hour = 12): Date =>
  new Date(year, month - 1, day, hour, 0, 0, 0);

/** The install earning the points — one `install_id`, as the app supplies. */
const DEVICE = "install-1";

const record = (patch: Partial<AcademyRecord> = {}): AcademyRecord => ({
  version: 1,
  chapters: {},
  lessons: {},
  usageByDevice: {},
  usageDay: null,
  usageToday: 0,
  streak: { current: 0, best: 0, lastActiveDay: null },
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...patch,
});

describe("usagePointsFor", () => {
  it("pays the everyday moments and the durable ones differently", () => {
    strictEqual(usagePointsFor("chat_message_sent"), 1);
    strictEqual(usagePointsFor("mission_created"), 1);
    strictEqual(usagePointsFor("skill_used"), 2);
    strictEqual(usagePointsFor("integration_connected"), 2);
    strictEqual(usagePointsFor("routine_scheduled"), 2);
    strictEqual(usagePointsFor("agent_created"), 2);
    strictEqual(usagePointsFor("agent_installed_from_store"), 2);
  });

  it("pays nothing for an event the economy never named", () => {
    // The map IS the economy: adding an analytics event must never start
    // paying points by accident.
    strictEqual(usagePointsFor("app_active"), 0);
    strictEqual(usagePointsFor("academy_opened"), 0);
    strictEqual(usagePointsFor("academy_lesson_completed"), 0);
    strictEqual(usagePointsFor("tab_opened"), 0);
  });

  it("never lists a rate that is not worth earning", () => {
    for (const rate of Object.values(USAGE_POINT_EVENTS)) {
      strictEqual(typeof rate, "number");
      strictEqual(rate > 0 && rate <= USAGE_DAILY_CAP, true);
    }
  });
});

describe("usageDayStamp", () => {
  it("reads the LOCAL calendar day, zero-padded", () => {
    strictEqual(usageDayStamp(at(2026, 8, 9, 0)), "2026-08-09");
    strictEqual(usageDayStamp(at(2026, 12, 31, 23)), "2026-12-31");
  });
});

describe("accrueUsage", () => {
  const now = at(2026, 8, 10);

  it("creates a record for a user who has none", () => {
    const next = accrueUsage(null, 2, now, DEVICE);
    strictEqual(totalUsagePoints(next), 2);
    deepStrictEqual(next?.usageByDevice, { [DEVICE]: 2 });
    strictEqual(next.usageDay, "2026-08-10");
    strictEqual(next.usageToday, 2);
    strictEqual(next.updatedAt, now.toISOString());
  });

  it("returns the record untouched when there is nothing to pay", () => {
    const base = record();
    strictEqual(accrueUsage(base, 0, now, DEVICE), base);
    strictEqual(accrueUsage(base, -3, now, DEVICE), base);
    strictEqual(accrueUsage(base, Number.NaN, now, DEVICE), base);
    strictEqual(accrueUsage(null, 0, now, DEVICE), null);
  });

  it("stops at the daily cap", () => {
    const capped = record({
      usageByDevice: { [DEVICE]: 40 },
      usageDay: "2026-08-10",
      usageToday: USAGE_DAILY_CAP,
    });
    strictEqual(accrueUsage(capped, 2, now, DEVICE), capped);
  });

  it("pays only the room that is left at the boundary", () => {
    const nearly = record({
      usageByDevice: { [DEVICE]: 118 },
      usageDay: "2026-08-10",
      usageToday: USAGE_DAILY_CAP - 2,
    });
    const next = accrueUsage(nearly, 5, now, DEVICE);
    strictEqual(next?.usageToday, USAGE_DAILY_CAP);
    strictEqual(totalUsagePoints(next), 120);
  });

  it("resets the tally on a new day without touching the total", () => {
    const yesterday = record({
      usageByDevice: { [DEVICE]: 20 },
      usageDay: "2026-08-09",
      usageToday: USAGE_DAILY_CAP,
    });
    const next = accrueUsage(yesterday, 2, now, DEVICE);
    strictEqual(next?.usageDay, "2026-08-10");
    strictEqual(next.usageToday, 2);
    strictEqual(totalUsagePoints(next), 22);
  });

  it("credits the install that earned the points, leaving the others alone", () => {
    const shared = record({ usageByDevice: { "install-2": 30, [DEVICE]: 4 } });
    deepStrictEqual(accrueUsage(shared, 3, now, DEVICE)?.usageByDevice, {
      "install-2": 30,
      [DEVICE]: 7,
    });
  });

  it("opens a counter for an install that has never earned before", () => {
    const other = record({ usageByDevice: { "install-2": 30 } });
    const next = accrueUsage(other, 5, now, "install-9");
    deepStrictEqual(next?.usageByDevice, { "install-2": 30, "install-9": 5 });
    strictEqual(totalUsagePoints(next), 35);
  });

  it("refuses to credit points to nobody", () => {
    // An unnamed install cannot be merged against, so the points would be
    // indistinguishable from another device's and get thrown away.
    throws(() => accrueUsage(null, 1, now, "  "), RangeError);
  });

  it("refuses a day EARLIER than the one already counted", () => {
    // Any day that merely DIFFERED used to clear the tally, so a clock moved
    // back one day handed out a second cap — and alternating the two handed
    // out an unlimited number.
    const capped = record({
      usageByDevice: { [DEVICE]: 20 },
      usageDay: "2026-08-10",
      usageToday: USAGE_DAILY_CAP,
    });
    strictEqual(accrueUsage(capped, 5, at(2026, 8, 9), DEVICE), capped);
    strictEqual(accrueUsage(capped, 5, at(2026, 7, 30), DEVICE), capped);
  });

  it("cannot be farmed by alternating the clock between two days", () => {
    let earned: AcademyRecord | null = null;
    for (let round = 0; round < 5; round++) {
      earned = accrueUsage(earned, USAGE_DAILY_CAP, at(2026, 8, 10), DEVICE);
      earned = accrueUsage(earned, USAGE_DAILY_CAP, at(2026, 8, 9), DEVICE);
    }
    strictEqual(totalUsagePoints(earned), USAGE_DAILY_CAP);
  });

  it("still pays when the clock moves forward past the counted day", () => {
    const capped = record({
      usageByDevice: { [DEVICE]: 20 },
      usageDay: "2026-08-10",
      usageToday: USAGE_DAILY_CAP,
    });
    strictEqual(
      totalUsagePoints(accrueUsage(capped, 5, at(2026, 8, 11), DEVICE)),
      25,
    );
  });

  it("never drags the streak back to an earlier day", () => {
    const ahead = record({
      usageDay: "2026-08-10",
      streak: { current: 6, best: 6, lastActiveDay: "2026-08-10" },
    });
    strictEqual(accrueUsage(ahead, 1, at(2026, 8, 9), DEVICE), ahead);
  });

  it("starts a streak on the first day the user earns anything", () => {
    deepStrictEqual(accrueUsage(null, 1, now, DEVICE)?.streak, {
      current: 1,
      best: 1,
      lastActiveDay: "2026-08-10",
    });
  });

  it("does not extend a streak twice in one day", () => {
    const started = accrueUsage(null, 1, now, DEVICE);
    const again = accrueUsage(started, 1, at(2026, 8, 10, 23), DEVICE);
    deepStrictEqual(again?.streak, started?.streak);
    strictEqual(totalUsagePoints(again), 2);
  });

  it("extends the streak on the very next calendar day", () => {
    const base = record({
      streak: { current: 4, best: 4, lastActiveDay: "2026-08-09" },
    });
    deepStrictEqual(accrueUsage(base, 1, now, DEVICE)?.streak, {
      current: 5,
      best: 5,
      lastActiveDay: "2026-08-10",
    });
  });

  it("starts over after a gap, keeping the best run as history", () => {
    const base = record({
      streak: { current: 9, best: 9, lastActiveDay: "2026-08-07" },
    });
    deepStrictEqual(accrueUsage(base, 1, now, DEVICE)?.streak, {
      current: 1,
      best: 9,
      lastActiveDay: "2026-08-10",
    });
  });

  it("does not drag a streak backwards for a clock that ran ahead", () => {
    // A record merged from a device further east can carry a day we have not
    // reached yet; rewinding it would cost the user a run they really had.
    const ahead = record({
      streak: { current: 6, best: 6, lastActiveDay: "2026-08-11" },
    });
    const next = accrueUsage(ahead, 1, now, DEVICE);
    deepStrictEqual(next?.streak, ahead.streak);
    strictEqual(totalUsagePoints(next), 1);
  });
});

describe("liveStreak", () => {
  const today = at(2026, 8, 10);

  it("reads nothing for a user with no record", () => {
    deepStrictEqual(liveStreak(null, today), { current: 0, best: 0 });
  });

  it("counts a run that reaches today", () => {
    const base = record({
      streak: { current: 5, best: 7, lastActiveDay: "2026-08-10" },
    });
    deepStrictEqual(liveStreak(base, today), { current: 5, best: 7 });
  });

  it("keeps yesterday's run alive — the day is not over", () => {
    const base = record({
      streak: { current: 5, best: 7, lastActiveDay: "2026-08-09" },
    });
    deepStrictEqual(liveStreak(base, today), { current: 5, best: 7 });
  });

  it("reads a broken run as zero, without forgetting the best", () => {
    // The stored `current` stands until it is next extended, so a run that
    // ended on Saturday would otherwise still claim to be alive on Tuesday.
    const base = record({
      streak: { current: 5, best: 7, lastActiveDay: "2026-08-08" },
    });
    deepStrictEqual(liveStreak(base, today), { current: 0, best: 7 });
  });

  it("reads a record that never earned a point as zero", () => {
    deepStrictEqual(liveStreak(record(), today), { current: 0, best: 0 });
  });
});

/**
 * WHICH device a point is credited to. The counters only mean something if the
 * key is per DEVICE: a key the account carries makes every machine one machine.
 */
describe("usageDeviceId", () => {
  function storage(seed: Record<string, string> = {}) {
    const values = new Map(Object.entries(seed));
    return {
      values,
      store: {
        read: (key: string) => values.get(key) ?? null,
        write: (key: string, value: string) => {
          values.set(key, value);
        },
      },
    };
  }

  it("mints an id on the device and keeps it", () => {
    const { store, values } = storage();
    let minted = 0;
    const mint = () => `device-${++minted}`;

    strictEqual(usageDeviceId(store, mint), "device-1");
    // Written where it was minted, so the next launch reads the same one and
    // the device's counter goes on growing instead of starting over.
    strictEqual(values.get(USAGE_DEVICE_KEY), "device-1");
    strictEqual(usageDeviceId(store, mint), "device-1");
    strictEqual(minted, 1);
  });

  it("keeps the id this device already has", () => {
    const { store } = storage({ [USAGE_DEVICE_KEY]: "device-9" });
    strictEqual(
      usageDeviceId(store, () => "device-new"),
      "device-9",
    );
  });

  it("mints over a blank entry", () => {
    const { store } = storage({ [USAGE_DEVICE_KEY]: "   " });
    strictEqual(
      usageDeviceId(store, () => "device-2"),
      "device-2",
    );
  });

  it("falls back to the anonymous install when storage is unavailable", () => {
    const unavailable = {
      read: () => {
        throw new Error("storage disabled");
      },
      write: () => {},
    };
    strictEqual(
      usageDeviceId(unavailable, () => "device-3"),
      UNKNOWN_DEVICE_ID,
    );
    const readOnly = {
      read: () => null,
      write: () => {
        throw new Error("quota exceeded");
      },
    };
    // An id that cannot be written is not this device's id: it would be a new
    // one every launch, scattering the counters it exists to keep together.
    strictEqual(
      usageDeviceId(readOnly, () => "device-4"),
      UNKNOWN_DEVICE_ID,
    );
  });
});
