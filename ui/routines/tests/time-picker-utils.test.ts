import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  is12HourLocale,
  periodLabels,
  to12Hour,
  from12Hour,
  buildTime,
  pad2,
  hourOptions,
  minuteOptions,
  type Period,
} from "../src/time-picker-utils.ts"

describe("is12HourLocale", () => {
  it("is true for en, false for es/pt", () => {
    assert.equal(is12HourLocale("en-US"), true)
    assert.equal(is12HourLocale("es"), false)
    assert.equal(is12HourLocale("pt-BR"), false)
  })
})

describe("periodLabels", () => {
  it("returns the locale's AM/PM markers", () => {
    assert.deepEqual(periodLabels("en-US"), { am: "AM", pm: "PM" })
  })
})

describe("to12Hour", () => {
  it("maps 24-hour to display hour + period", () => {
    assert.deepEqual(to12Hour(0), { hour: 12, period: "am" })
    assert.deepEqual(to12Hour(9), { hour: 9, period: "am" })
    assert.deepEqual(to12Hour(12), { hour: 12, period: "pm" })
    assert.deepEqual(to12Hour(13), { hour: 1, period: "pm" })
    assert.deepEqual(to12Hour(23), { hour: 11, period: "pm" })
  })
})

describe("from12Hour", () => {
  it("maps display hour + period back to 24-hour", () => {
    assert.equal(from12Hour(12, "am"), 0)
    assert.equal(from12Hour(9, "am"), 9)
    assert.equal(from12Hour(12, "pm"), 12)
    assert.equal(from12Hour(1, "pm"), 13)
    assert.equal(from12Hour(11, "pm"), 23)
  })

  it("round-trips with to12Hour for every hour", () => {
    for (let h = 0; h < 24; h++) {
      const { hour, period } = to12Hour(h)
      assert.equal(from12Hour(hour, period as Period), h)
    }
  })
})

describe("pad2 + buildTime", () => {
  it("zero-pads each part", () => {
    assert.equal(pad2(0), "00")
    assert.equal(pad2(9), "09")
    assert.equal(pad2(23), "23")
    assert.equal(buildTime(9, 0), "09:00")
    assert.equal(buildTime(13, 5), "13:05")
    assert.equal(buildTime(0, 30), "00:30")
  })
})

describe("option builders", () => {
  it("hourOptions: 1–12 for 12h, 0–23 for 24h", () => {
    assert.deepEqual(hourOptions(true), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    assert.equal(hourOptions(false).length, 24)
    assert.equal(hourOptions(false)[0], 0)
    assert.equal(hourOptions(false)[23], 23)
  })

  it("minuteOptions: 0–59", () => {
    const mins = minuteOptions()
    assert.equal(mins.length, 60)
    assert.equal(mins[0], 0)
    assert.equal(mins[59], 59)
  })
})
