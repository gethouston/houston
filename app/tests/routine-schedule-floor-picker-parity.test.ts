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
  paidSeats: null,
  seatsInUse: null,
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
