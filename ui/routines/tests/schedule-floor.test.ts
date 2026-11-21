import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_SCHEDULE_LABELS, interp } from "../src/labels.ts";
import {
  type BuilderPick,
  builderOutput,
} from "../src/schedule-builder-output.ts";
import type { ScheduleOptions } from "../src/schedule-cron-utils.ts";
import {
  countForUnitSwitch,
  defaultMinutesCount,
  floorMinuteMinimum,
  floorStepper,
  presetAllowed,
  type ScheduleFloor,
} from "../src/schedule-floor.ts";
import type { SchedulePreset } from "../src/types.ts";

function realGap(schedule: string): number | null {
  const every = schedule.match(/^@every (\d+)(m|h)$/);
  if (every) return Number(every[1]) * (every[2] === "h" ? 60 : 1);
  if (schedule === "* * * * *") return 1;
  if (schedule === "0 * * * *") return 60;
  const hours = schedule.match(/^0 \*\/(\d+) \* \* \*$/);
  if (hours) return Number(hours[1]) * 60;
  const step = schedule.match(/^\*\/(\d+) \* \* \* \*$/);
  if (!step) return null;
  const n = Number(step[1]);
  const last = Math.floor(59 / n) * n;
  return last === 0 ? 60 : Math.min(n, 60 - last);
}
const floorOf = (minutes: number): ScheduleFloor => ({
  minutes,
  allows: (schedule) => {
    const gap = realGap(schedule);
    return gap === null || gap >= minutes;
  },
});
const FREE = floorOf(15);
const MINIMUM = floorMinuteMinimum(FREE);
const OPTS: ScheduleOptions = { time: "09:00", daysOfWeek: [1], dayOfMonth: 1 };
const ALL_PRESETS: SchedulePreset[] = [
  "every_30min",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "custom",
];

function pick(patch: Partial<BuilderPick>): BuilderPick {
  return {
    activePreset: "custom",
    options: OPTS,
    intervalEvery: "15",
    intervalUnit: "minutes",
    ...patch,
  };
}

function step(every: string, act: "down" | "up" | "commit"): number | null {
  let landed: number | null = null;
  const stepper = floorStepper(every, "minutes", MINIMUM, (to) => {
    landed = to;
  });
  assert.ok(stepper);
  const action = stepper[act];
  if (action === null) return null;
  action();
  return landed;
}

describe("schedule floor: the counts the rule offers", () => {
  it("starts at the floor itself: every count from 15 saves at its own gap", () => {
    assert.equal(MINIMUM, 15);
    assert.equal(floorMinuteMinimum(floorOf(61)), 61);
    for (const n of [15, 16, 17, 25, 46, 90])
      assert.equal(
        builderOutput(pick({ intervalEvery: String(n), floor: FREE })).floorOk,
        true,
        String(n),
      );
  });

  it("offers every preset on Free and hides one the rule refuses", () => {
    for (const preset of ALL_PRESETS) {
      assert.equal(presetAllowed(preset, OPTS, undefined), true, preset);
      assert.equal(presetAllowed(preset, OPTS, FREE), true, preset);
    }
    const shown = ALL_PRESETS.filter((p) =>
      presetAllowed(p, OPTS, floorOf(45)),
    );
    assert.deepEqual(shown, ["hourly", "daily", "weekly", "monthly", "custom"]);
  });

  it("starts at the floor's minimum instead of 5 minutes", () => {
    assert.equal(defaultMinutesCount(undefined), 5);
    assert.equal(defaultMinutesCount(MINIMUM), 15);
    assert.equal(defaultMinutesCount(3), 5);
    assert.equal(defaultMinutesCount(null), 5);
  });

  it("lifts a count below the minimum when the unit switches to minutes", () => {
    assert.equal(countForUnitSwitch("2", "minutes", MINIMUM), "15");
    assert.equal(countForUnitSwitch("16", "minutes", MINIMUM), null);
    assert.equal(countForUnitSwitch("90", "minutes", MINIMUM), null);
    assert.equal(countForUnitSwitch("2", "hours", MINIMUM), null);
    assert.equal(countForUnitSwitch("", "minutes", MINIMUM), null);
    assert.equal(countForUnitSwitch("2", "minutes", undefined), null);
  });
});

describe("schedule floor: the minutes stepper", () => {
  it("steps by one without a floor or on any other unit", () => {
    assert.equal(
      floorStepper("15", "minutes", undefined, () => {}),
      undefined,
    );
    assert.equal(
      floorStepper("15", "hours", MINIMUM, () => {}),
      undefined,
    );
  });

  it("moves by one at or above the minimum, never below it", () => {
    assert.equal(step("15", "down"), null);
    assert.equal(step("16", "down"), 15);
    assert.equal(step("15", "up"), 16);
    assert.equal(step("16", "up"), 17);
    assert.equal(step("59", "up"), 60);
    assert.equal(step("10080", "up"), 10080);
  });

  it("steps from a typed count below the minimum onto it", () => {
    assert.equal(step("5", "up"), 15);
    assert.equal(step("5", "down"), null);
    assert.equal(step("", "up"), 15);
    assert.equal(step("", "down"), null);
  });

  it("lifts a typed count below the minimum on blur, and keeps the rest", () => {
    assert.equal(step("5", "commit"), 15);
    assert.equal(step("14", "commit"), 15);
    assert.equal(step("16", "commit"), null);
    assert.equal(step("90", "commit"), null);
    assert.equal(step("", "commit"), null);
  });
});

describe("schedule floor: what the builder emits", () => {
  it("Free plus every 16 minutes saves the true interval", () => {
    const out = builderOutput(pick({ intervalEvery: "16", floor: FREE }));
    assert.equal(out.floorOk, true);
    assert.equal(out.schedule, "@every 16m");
  });

  it("Free plus every 15 minutes saves the even cron", () => {
    const out = builderOutput(pick({ intervalEvery: "15", floor: FREE }));
    assert.equal(out.schedule, "*/15 * * * *");
  });

  it("emits nothing for a count under the floor, so Save stays blocked", () => {
    for (const [n, spelled] of [
      ["5", "*/5 * * * *"],
      ["10", "*/10 * * * *"],
      ["14", "@every 14m"],
    ]) {
      const refused = builderOutput(pick({ intervalEvery: n, floor: FREE }));
      assert.equal(refused.floorOk, false, n);
      assert.equal(refused.schedule, "", n);
      assert.equal(refused.picked, spelled, n);
    }
  });

  it("blocks a preset the rule refuses", () => {
    const d = builderOutput(
      pick({ activePreset: "every_30min", floor: floorOf(45) }),
    );
    assert.equal(d.schedule, "");
    assert.equal(d.picked, "*/30 * * * *");
  });

  it("asks the rule about hours too", () => {
    const d = builderOutput(
      pick({ intervalEvery: "5", intervalUnit: "hours", floor: FREE }),
    );
    assert.equal(d.schedule, "@every 5h");
  });

  it("changes nothing without a floor", () => {
    for (const [every, schedule] of [
      ["1", "* * * * *"],
      ["5", "*/5 * * * *"],
      ["16", "@every 16m"],
      ["90", "@every 90m"],
      ["", ""],
    ])
      assert.equal(
        builderOutput(pick({ intervalEvery: every })).schedule,
        schedule,
      );
    assert.equal(
      builderOutput(pick({ activePreset: "daily" })).schedule,
      "0 9 * * *",
    );
  });

  it("names the floor in the hint", () => {
    assert.equal(
      interp(DEFAULT_SCHEDULE_LABELS.minIntervalHint, { minutes: 15 }),
      "Routines run at most once every 15 minutes.",
    );
  });
});
