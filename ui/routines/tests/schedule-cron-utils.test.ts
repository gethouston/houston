import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  presetToCron,
  cronToPreset,
  cronToOptions,
  type ScheduleOptions,
} from "../src/schedule-cron-utils.ts";
import { cronSummary } from "../src/schedule-summary.ts";
import {
  intervalToCron,
  cronToInterval,
  type ScheduleInterval,
} from "../src/schedule-interval-utils.ts";

const OPTS: ScheduleOptions = {
  time: "09:00",
  daysOfWeek: [3],
  dayOfMonth: 15,
};

describe("cronToPreset", () => {
  it("detects the built-in presets", () => {
    assert.equal(cronToPreset("*/30 * * * *"), "every_30min");
    assert.equal(cronToPreset("0 * * * *"), "hourly");
    assert.equal(cronToPreset("0 9 * * *"), "daily");
    assert.equal(cronToPreset("30 8 * * *"), "daily");
    assert.equal(cronToPreset("0 9 * * 3"), "weekly");
    assert.equal(cronToPreset("0 9 * * 1,3,5"), "weekly");
    // Legacy "Weekdays only" range still classifies as Weekly (Mon-Fri).
    assert.equal(cronToPreset("0 9 * * 1-5"), "weekly");
    assert.equal(cronToPreset("0 9 15 * *"), "monthly");
  });

  // The crux of issue #374: an every-N-minutes cron must classify as "custom",
  // not null. Previously null was treated as "empty" and the builder fell back
  // to the Daily preset, silently overwriting the schedule on reopen.
  it("classifies a non-empty, non-preset cron as custom", () => {
    assert.equal(cronToPreset("*/5 * * * *"), "custom");
    assert.equal(cronToPreset("*/1 * * * *"), "custom");
    assert.equal(cronToPreset("* * * * *"), "custom");
    assert.equal(cronToPreset("0 */2 * * *"), "custom");
    assert.equal(cronToPreset("0 9 1-3 * *"), "custom"); // day-of-month range
    assert.equal(cronToPreset("not a cron"), "custom");
  });

  it("returns null only for an empty schedule", () => {
    assert.equal(cronToPreset(""), null);
    assert.equal(cronToPreset("   "), null);
  });
});

describe("presetToCron / cronToPreset round-trip", () => {
  it("round-trips every detectable preset", () => {
    const presets = [
      "every_30min",
      "hourly",
      "daily",
      "weekly",
      "monthly",
    ] as const;
    for (const preset of presets) {
      const cron = presetToCron(preset, OPTS);
      assert.equal(cronToPreset(cron), preset, `${preset} -> ${cron}`);
    }
  });

  it("emits a sorted day list for a multi-day Weekly preset", () => {
    const cron = presetToCron("weekly", { ...OPTS, daysOfWeek: [5, 1, 3] });
    assert.equal(cron, "0 9 * * 1,3,5");
    assert.equal(cronToPreset(cron), "weekly");
  });
});

describe("cronToOptions", () => {
  it("extracts the time from a daily cron", () => {
    assert.equal(cronToOptions("30 8 * * *").time, "08:30");
  });
  it("extracts a single day of week as a list", () => {
    assert.deepEqual(cronToOptions("0 9 * * 4").daysOfWeek, [4]);
  });
  it("extracts a multi-day list, sorted", () => {
    assert.deepEqual(cronToOptions("0 9 * * 5,1,3").daysOfWeek, [1, 3, 5]);
  });
  it("expands a legacy weekday range", () => {
    assert.deepEqual(cronToOptions("0 9 * * 1-5").daysOfWeek, [1, 2, 3, 4, 5]);
  });
  it("extracts the day of month", () => {
    assert.equal(cronToOptions("0 9 15 * *").dayOfMonth, 15);
  });
  it("returns no spurious options for interval crons", () => {
    assert.deepEqual(cronToOptions("*/5 * * * *"), {});
  });
});

describe("cronSummary", () => {
  it("describes every-N-minute schedules in plain words", () => {
    assert.equal(cronSummary("* * * * *"), "Runs every minute");
    assert.equal(cronSummary("*/1 * * * *"), "Runs every minute");
    assert.equal(cronSummary("*/5 * * * *"), "Runs every 5 minutes");
    assert.equal(cronSummary("*/10 * * * *"), "Runs every 10 minutes");
  });
  it("describes every-N-hour schedules", () => {
    assert.equal(cronSummary("0 */1 * * *"), "Runs every hour");
    assert.equal(cronSummary("0 */2 * * *"), "Runs every 2 hours");
  });
  it("describes the presets", () => {
    assert.equal(cronSummary("*/30 * * * *"), "Runs every 30 minutes");
    assert.equal(cronSummary("0 9 * * *"), "Runs every day at 9:00 AM");
    // A legacy Mon-Fri range now reads as a Weekly day list.
    assert.equal(
      cronSummary("0 9 * * 1-5"),
      "Runs every week on Mon, Tue, Wed, Thu, and Fri at 9:00 AM",
    );
  });
  it("describes every-N-day schedules with a time", () => {
    assert.equal(cronSummary("30 8 */2 * *"), "Runs every 2 days at 8:30 AM");
    assert.equal(cronSummary("0 14 */3 * *"), "Runs every 3 days at 2:00 PM");
  });
  it("describes weekly and every-N-month schedules", () => {
    assert.equal(cronSummary("0 9 * * 3"), "Runs every Wednesday at 9:00 AM");
    // Day list is localized + joined with Intl.ListFormat (Oxford comma in en).
    assert.equal(
      cronSummary("0 9 * * 1,3,5"),
      "Runs every week on Mon, Wed, and Fri at 9:00 AM",
    );
    assert.equal(
      cronSummary("0 9 * * 6,0"),
      "Runs every week on Sun and Sat at 9:00 AM",
    );
    assert.equal(
      cronSummary("30 8 1 */2 *"),
      "Runs on the 1st of every 2 months at 8:30 AM",
    );
  });
  it("falls back gracefully for irregular crons and empty input", () => {
    assert.equal(cronSummary("0 9 1-3 * *"), "Custom schedule");
    assert.equal(cronSummary(""), "No schedule set");
  });
});

describe("intervalToCron", () => {
  it("builds every-N-minute crons", () => {
    assert.equal(
      intervalToCron({ every: 1, unit: "minutes" }, "09:00"),
      "* * * * *",
    );
    assert.equal(
      intervalToCron({ every: 5, unit: "minutes" }, "09:00"),
      "*/5 * * * *",
    );
  });
  it("builds every-N-hour crons", () => {
    assert.equal(
      intervalToCron({ every: 1, unit: "hours" }, "09:00"),
      "0 * * * *",
    );
    assert.equal(
      intervalToCron({ every: 2, unit: "hours" }, "09:00"),
      "0 */2 * * *",
    );
  });
  it("builds every-N-day crons honoring the time of day", () => {
    assert.equal(
      intervalToCron({ every: 1, unit: "days" }, "08:30"),
      "30 8 * * *",
    );
    assert.equal(
      intervalToCron({ every: 3, unit: "days" }, "08:30"),
      "30 8 */3 * *",
    );
  });
  it("builds every-N-month crons on a day of month", () => {
    assert.equal(
      intervalToCron({ every: 1, unit: "months", dayOfMonth: 15 }, "09:00"),
      "0 9 15 * *",
    );
    assert.equal(
      intervalToCron({ every: 2, unit: "months", dayOfMonth: 1 }, "07:00"),
      "0 7 1 */2 *",
    );
  });
  it("clamps the count to at least 1", () => {
    assert.equal(
      intervalToCron({ every: 0, unit: "minutes" }, "09:00"),
      "* * * * *",
    );
  });
});

describe("cronToInterval", () => {
  it("parses interval crons back into structured intervals", () => {
    assert.deepEqual(cronToInterval("* * * * *"), {
      every: 1,
      unit: "minutes",
    });
    assert.deepEqual(cronToInterval("*/5 * * * *"), {
      every: 5,
      unit: "minutes",
    });
    assert.deepEqual(cronToInterval("0 * * * *"), { every: 1, unit: "hours" });
    assert.deepEqual(cronToInterval("0 */2 * * *"), {
      every: 2,
      unit: "hours",
    });
    assert.deepEqual(cronToInterval("30 8 * * *"), { every: 1, unit: "days" });
    assert.deepEqual(cronToInterval("30 8 */3 * *"), {
      every: 3,
      unit: "days",
    });
  });
  it("parses monthly crons", () => {
    assert.deepEqual(cronToInterval("0 9 15 * *"), {
      every: 1,
      unit: "months",
      dayOfMonth: 15,
    });
    assert.deepEqual(cronToInterval("0 7 1 */2 *"), {
      every: 2,
      unit: "months",
      dayOfMonth: 1,
    });
  });
  it("returns null for crons the picker can't represent", () => {
    // Weekly day lists/ranges belong to the Weekly preset, not the custom picker.
    assert.equal(cronToInterval("0 9 * * 1,3,5"), null);
    assert.equal(cronToInterval("0 9 * * 1-5"), null);
    assert.equal(cronToInterval("0 9 1-3 * *"), null); // day-of-month range
    assert.equal(cronToInterval("not a cron"), null);
  });
  it("round-trips through intervalToCron", () => {
    const cases: ScheduleInterval[] = [
      { every: 1, unit: "minutes" },
      { every: 15, unit: "minutes" },
      { every: 2, unit: "hours" },
      { every: 4, unit: "days" },
      { every: 1, unit: "months", dayOfMonth: 15 },
      { every: 3, unit: "months", dayOfMonth: 1 },
    ];
    for (const interval of cases) {
      const cron = intervalToCron(interval, "07:45");
      assert.deepEqual(
        cronToInterval(cron),
        interval,
        `${JSON.stringify(interval)} -> ${cron}`,
      );
    }
  });
});
