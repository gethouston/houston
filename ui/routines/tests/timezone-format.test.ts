import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  describeZone,
  zoneOffset,
  buildZoneOptions,
  foldDiacritics,
} from "../src/timezone-format.ts"

describe("foldDiacritics", () => {
  it("strips accents so accented queries can match ASCII zone names", () => {
    assert.equal(foldDiacritics("São Paulo"), "Sao Paulo")
    assert.equal(foldDiacritics("Zürich"), "Zurich")
    assert.equal(foldDiacritics("Bogotá"), "Bogota")
    assert.equal(foldDiacritics("México"), "Mexico")
  })

  it("leaves plain ASCII untouched (idempotent)", () => {
    assert.equal(foldDiacritics("New York"), "New York")
    assert.equal(foldDiacritics("gmt+5"), "gmt+5")
  })
})

describe("describeZone", () => {
  it("splits a two-segment id into city + region", () => {
    const z = describeZone("America/New_York")
    assert.equal(z.city, "New York")
    assert.equal(z.region, "America")
  })

  it("leaves region empty for a single-segment id", () => {
    const z = describeZone("UTC")
    assert.equal(z.city, "UTC")
    assert.equal(z.region, "")
  })

  it("uses the last segment as the city for nested ids", () => {
    const z = describeZone("America/Argentina/Buenos_Aires")
    assert.equal(z.city, "Buenos Aires")
    assert.equal(z.region, "America")
  })

  it("exposes the flattened id as a keyword so middle segments stay searchable", () => {
    const z = describeZone("America/Argentina/Buenos_Aires")
    // The flattened id keeps "Argentina" (a hidden middle segment) findable.
    assert.ok(z.keywords.some((k) => k.includes("Argentina")))
    assert.ok(z.keywords.includes("Buenos Aires"))
    assert.ok(z.keywords.includes("America"))
  })

  it("de-duplicates keywords", () => {
    const z = describeZone("UTC")
    assert.equal(z.keywords.length, new Set(z.keywords).size)
  })
})

describe("zoneOffset", () => {
  it("formats a GMT offset for a known zone", () => {
    // Jan 15 2024: New York is on EST (no DST), a stable -5.
    const offset = zoneOffset("America/New_York", new Date("2024-01-15T12:00:00Z"))
    assert.equal(offset, "GMT-5")
  })

  it("returns empty string for a bogus zone instead of throwing", () => {
    assert.equal(zoneOffset("Not/AZone", new Date("2024-01-15T12:00:00Z")), "")
  })
})

describe("buildZoneOptions", () => {
  const now = new Date("2024-01-15T12:00:00Z")

  it("includes the account zone even if the platform omits it", () => {
    const opts = buildZoneOptions("Mars/Olympus_Mons", now)
    assert.equal(opts[0].id, "Mars/Olympus_Mons")
    assert.equal(opts[0].city, "Olympus Mons")
  })

  it("does not duplicate the account zone when the platform lists it", () => {
    const opts = buildZoneOptions("America/New_York", now)
    const matches = opts.filter((o) => o.id === "America/New_York")
    assert.equal(matches.length, 1)
  })

  it("folds the offset into each entry's keywords", () => {
    const opts = buildZoneOptions("America/New_York", now)
    const ny = opts.find((o) => o.id === "America/New_York")
    assert.ok(ny)
    assert.equal(ny.offset, "GMT-5")
    assert.ok(ny.keywords.includes("GMT-5"))
  })
})
