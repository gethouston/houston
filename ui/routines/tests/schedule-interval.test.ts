import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { nextFire } from "../src/next-fire.ts";
import {
  type EveryUnit,
  everySchedule,
  parseEverySchedule,
} from "../src/schedule-interval-form.ts";
import {
  intervalCountAllowed,
  intervalCountMax,
  intervalToSchedule,
  scheduleToInterval,
} from "../src/schedule-interval-utils.ts";
import { cronSummary } from "../src/schedule-summary.ts";

interface Fixtures {
  canonical: { every: number; unit: EveryUnit; schedule: string }[];
  parse: {
    schedule: string;
    interval: { every: number; unit: EveryUnit } | null;
  }[];
  canonicalize: { schedule: string; canonical: string }[];
  next: { schedule: string; after: string; next: string | null }[];
}

const fixtures = JSON.parse(
  readFileSync(
    new URL("./schedule-interval.fixtures.json", import.meta.url),
    "utf8",
  ),
) as Fixtures;

describe("everySchedule (fixture table)", () => {
  for (const row of fixtures.canonical) {
    it(`${row.every} ${row.unit} -> ${row.schedule}`, () => {
      assert.equal(everySchedule(row.every, row.unit), row.schedule);
    });
  }
});

describe("parseEverySchedule (fixture table)", () => {
  for (const row of fixtures.parse) {
    it(`'${row.schedule}'`, () => {
      assert.deepEqual(parseEverySchedule(row.schedule), row.interval);
    });
  }
});

describe("parse then canonicalize (fixture table)", () => {
  for (const row of fixtures.canonicalize) {
    it(`'${row.schedule}' -> '${row.canonical}'`, () => {
      const interval = parseEverySchedule(row.schedule);
      const canonical = interval
        ? everySchedule(interval.every, interval.unit)
        : row.schedule;
      assert.equal(canonical, row.canonical);
    });
  }
});

describe("nextFire on the epoch grid (fixture table)", () => {
  for (const row of fixtures.next) {
    it(`${row.schedule} after ${row.after}`, () => {
      for (const tz of ["UTC", "Asia/Kolkata"]) {
        const next = nextFire(row.schedule, tz, new Date(row.after));
        assert.equal(next?.toISOString() ?? null, row.next);
      }
    });
  }
});

describe("the picker writes and reads the interval form", () => {
  it("writes cron for even cadences and @every for uneven ones", () => {
    const at = "09:00";
    assert.equal(
      intervalToSchedule({ every: 16, unit: "minutes" }, at),
      "@every 16m",
    );
    assert.equal(
      intervalToSchedule({ every: 90, unit: "minutes" }, at),
      "@every 90m",
    );
    assert.equal(
      intervalToSchedule({ every: 120, unit: "minutes" }, at),
      "0 */2 * * *",
    );
    assert.equal(
      intervalToSchedule({ every: 5, unit: "hours" }, at),
      "@every 5h",
    );
    assert.equal(
      intervalToSchedule({ every: 30, unit: "minutes" }, at),
      "*/30 * * * *",
    );
  });

  it("reads @every back, and still reads a legacy */16 as 16 minutes", () => {
    assert.deepEqual(scheduleToInterval("@every 16m"), {
      every: 16,
      unit: "minutes",
    });
    assert.deepEqual(scheduleToInterval("@every 5h"), {
      every: 5,
      unit: "hours",
    });
    assert.deepEqual(scheduleToInterval("*/16 * * * *"), {
      every: 16,
      unit: "minutes",
    });
    assert.equal(scheduleToInterval("@every 1h30m"), null);
  });

  it("round-trips every uneven count", () => {
    for (const every of [7, 16, 45, 90, 100, 10080]) {
      const interval = { every, unit: "minutes" as const };
      const schedule = intervalToSchedule(interval, "09:00");
      assert.deepEqual(scheduleToInterval(schedule), interval, schedule);
    }
  });

  it("caps minutes and hours at 7 days, days at 31 and months at 12", () => {
    assert.equal(intervalCountAllowed(10080, "minutes"), true);
    assert.equal(intervalCountAllowed(10081, "minutes"), false);
    assert.equal(intervalCountAllowed(168, "hours"), true);
    assert.equal(intervalCountAllowed(169, "hours"), false);
    assert.equal(intervalCountAllowed(31, "days"), true);
    assert.equal(intervalCountAllowed(32, "days"), false);
    assert.equal(intervalCountAllowed(400, "days"), false);
    assert.equal(intervalCountAllowed(12, "months"), true);
    assert.equal(intervalCountAllowed(13, "months"), false);
    assert.equal(intervalCountAllowed(0, "minutes"), false);
    assert.equal(intervalCountAllowed(1.5, "hours"), false);
    assert.deepEqual(
      (["minutes", "hours", "days", "months"] as const).map(intervalCountMax),
      [10080, 168, 31, 12],
    );
  });
});

describe("cronSummary of an interval", () => {
  it("reads like its cron twin", () => {
    assert.equal(cronSummary("@every 16m"), "Runs every 16 minutes");
    assert.equal(cronSummary("@every 90m"), "Runs every 90 minutes");
    assert.equal(cronSummary("@every 5h"), "Runs every 5 hours");
    assert.equal(cronSummary("@every 1m"), "Runs every minute");
    assert.equal(cronSummary("@every 1h"), "Runs every hour");
  });

  it("falls back to the generic label for a malformed interval", () => {
    assert.equal(cronSummary("@every 1h30m"), "Custom schedule");
  });
});

describe("nextFire of an interval", () => {
  it("keeps the cadence across the hour: :48 -> :04", () => {
    const from = new Date("2026-06-12T12:48:00.000Z");
    assert.equal(
      nextFire("@every 16m", "UTC", from)?.toISOString(),
      "2026-06-12T13:04:00.000Z",
    );
    assert.equal(
      nextFire("*/16 * * * *", "UTC", from)?.toISOString(),
      "2026-06-12T13:00:00.000Z",
    );
  });

  it("ignores the timezone and never returns `from` itself", () => {
    const from = new Date("2026-06-12T13:04:00.000Z");
    for (const tz of ["UTC", "Asia/Kolkata", "America/Bogota"]) {
      assert.equal(
        nextFire("@every 16m", tz, from)?.toISOString(),
        "2026-06-12T13:20:00.000Z",
      );
    }
  });

  it("is null for a malformed interval", () => {
    assert.equal(nextFire("@every 0m", "UTC"), null);
  });
});
