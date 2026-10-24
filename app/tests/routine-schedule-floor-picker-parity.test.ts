import { deepStrictEqual, ok } from "node:assert";
import { describe, it } from "node:test";
import type { OrgBilling } from "@houston/engine-adapter";
import {
  routineScheduleFloor,
  scheduleFloorAllows,
  scheduleFloorRule,
} from "@houston/sdk";
import {
  presetToCron,
  type ScheduleOptions,
} from "../../ui/routines/src/schedule-cron-utils.ts";
import {
  floorMinuteMinimum,
  presetAllowed,
} from "../../ui/routines/src/schedule-floor.ts";
import {
  intervalCountMax,
  intervalToSchedule,
} from "../../ui/routines/src/schedule-interval-utils.ts";
import type { SchedulePreset } from "../../ui/routines/src/types.ts";

/**
 * SDK regression: the schedule picker offers exactly what the save backstop
 * and the host's gate accept under a free org's floor. The picker lives in
 * `ui/routines` and only asks the rule it is handed; the app hands it the
 * SDK's (`scheduleFloorRule`), the same `scheduleFloorAllows` the host's
 * routine-write gate runs, so the agreement is pinned here.
 */

const free: OrgBilling = {
  tier: "free",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: true,
  isBillingOwner: true,
  seats: 1,
  interval: null,
  seatPriceCents: 2000,
  seatPrices: { monthlyCents: 2000, annualCents: 18000 },
  seatGraceEndsAt: null,
  renewsAt: null,
  priceNotice: null,
  nextAdjustment: null,
  usage: null,
  routines: {
    paused: false,
    kept: null,
    maxActive: 1,
    minIntervalMinutes: 15,
    needsChoice: false,
    limitedCount: 0,
  },
};
const minutes = routineScheduleFloor(free);
const rule = scheduleFloorRule(minutes ?? 0);
const OPTIONS: ScheduleOptions = {
  time: "09:30",
  daysOfWeek: [1, 3, 5],
  dayOfMonth: 15,
};
const PRESETS: SchedulePreset[] = [
  "every_30min",
  "hourly",
  "daily",
  "weekly",
  "monthly",
];

describe("picker and save backstop agree in a free org", () => {
  it("has the Free floor", () => {
    ok(minutes === 15);
  });

  it("offers every minute count from the floor up, each one saved at its own gap", () => {
    // An uneven count saves as a true interval (`@every 16m`), so its real gap
    // IS the count; a plain `*\/16` would restart at :00 (:48 then :00).
    const minimum = floorMinuteMinimum(rule);
    deepStrictEqual(minimum, 15);
    for (let every = 1; every <= intervalCountMax("minutes"); every++) {
      const schedule = intervalToSchedule(
        { every, unit: "minutes" },
        OPTIONS.time,
      );
      ok(
        every >= 15 === scheduleFloorAllows(schedule, minutes),
        `${every}: ${schedule}`,
      );
    }
    deepStrictEqual(
      intervalToSchedule({ every: 16, unit: "minutes" }, OPTIONS.time),
      "@every 16m",
    );
    ok(!scheduleFloorAllows("*/16 * * * *", minutes));
  });

  it("accepts every hours, days and months count (1 to 120)", () => {
    for (const unit of ["hours", "days", "months"] as const)
      for (let every = 1; every <= 120; every++) {
        const cron = intervalToSchedule(
          { every, unit, dayOfMonth: OPTIONS.dayOfMonth },
          OPTIONS.time,
        );
        ok(scheduleFloorAllows(cron, minutes), `${unit} ${every}: ${cron}`);
      }
  });

  it("accepts every preset the picker shows", () => {
    for (const preset of PRESETS) {
      ok(presetAllowed(preset, OPTIONS, rule), preset);
      const cron = presetToCron(preset, OPTIONS);
      ok(scheduleFloorAllows(cron, minutes), `${preset}: ${cron}`);
    }
  });
});
