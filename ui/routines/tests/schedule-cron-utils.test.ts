import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  presetToCron,
  presetSummary,
  cronToPreset,
  cronToOptions,
  cronSummary,
  type ScheduleOptions,
} from "../src/schedule-cron-utils.ts"

const OPTS: ScheduleOptions = { time: "09:00", dayOfWeek: 3, dayOfMonth: 15 }

describe("cronToPreset", () => {
  it("detects the built-in presets", () => {
    assert.equal(cronToPreset("*/30 * * * *"), "every_30min")
    assert.equal(cronToPreset("0 * * * *"), "hourly")
    assert.equal(cronToPreset("0 9 * * *"), "daily")
    assert.equal(cronToPreset("30 8 * * *"), "daily")
    assert.equal(cronToPreset("0 9 * * 1-5"), "weekdays")
    assert.equal(cronToPreset("0 9 * * 3"), "weekly")
    assert.equal(cronToPreset("0 9 15 * *"), "monthly")
  })

  // The crux of issue #374: an every-N-minutes cron must classify as "custom",
  // not null. Previously null was treated as "empty" and the builder fell back
  // to the Daily preset, silently overwriting the schedule on reopen.
  it("classifies a non-empty, non-preset cron as custom", () => {
    assert.equal(cronToPreset("*/5 * * * *"), "custom")
    assert.equal(cronToPreset("*/1 * * * *"), "custom")
    assert.equal(cronToPreset("* * * * *"), "custom")
    assert.equal(cronToPreset("0 */2 * * *"), "custom")
    assert.equal(cronToPreset("0 9 * * 1-3"), "custom")
    assert.equal(cronToPreset("not a cron"), "custom")
  })

  it("returns null only for an empty schedule", () => {
    assert.equal(cronToPreset(""), null)
    assert.equal(cronToPreset("   "), null)
  })
})

describe("presetToCron / cronToPreset round-trip", () => {
  it("round-trips every detectable preset", () => {
    const presets = [
      "every_30min",
      "hourly",
      "daily",
      "weekdays",
      "weekly",
      "monthly",
    ] as const
    for (const preset of presets) {
      const cron = presetToCron(preset, OPTS)
      assert.equal(cronToPreset(cron), preset, `${preset} -> ${cron}`)
    }
  })
})

describe("cronToOptions", () => {
  it("extracts the time from a daily cron", () => {
    assert.equal(cronToOptions("30 8 * * *").time, "08:30")
  })
  it("extracts the day of week", () => {
    assert.equal(cronToOptions("0 9 * * 4").dayOfWeek, 4)
  })
  it("extracts the day of month", () => {
    assert.equal(cronToOptions("0 9 15 * *").dayOfMonth, 15)
  })
  it("returns no spurious options for interval crons", () => {
    assert.deepEqual(cronToOptions("*/5 * * * *"), {})
  })
})

describe("cronSummary", () => {
  it("describes every-N-minute schedules in plain words", () => {
    assert.equal(cronSummary("* * * * *"), "Runs every minute")
    assert.equal(cronSummary("*/1 * * * *"), "Runs every minute")
    assert.equal(cronSummary("*/5 * * * *"), "Runs every 5 minutes")
    assert.equal(cronSummary("*/10 * * * *"), "Runs every 10 minutes")
  })
  it("describes every-N-hour schedules", () => {
    assert.equal(cronSummary("0 */1 * * *"), "Runs every hour")
    assert.equal(cronSummary("0 */2 * * *"), "Runs every 2 hours")
  })
  it("describes the presets", () => {
    assert.equal(cronSummary("*/30 * * * *"), "Runs every 30 minutes")
    assert.equal(cronSummary("0 9 * * *"), "Runs every day at 9:00 AM")
    assert.equal(
      cronSummary("0 9 * * 1-5"),
      "Runs Monday through Friday at 9:00 AM",
    )
  })
  it("falls back gracefully for irregular crons and empty input", () => {
    assert.equal(cronSummary("0 9 1-3 * *"), "Custom schedule")
    assert.equal(cronSummary(""), "No schedule set")
  })
})
