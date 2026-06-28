import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isoToLocalDate } from "../src/lib/date-utils.ts";

describe("isoToLocalDate", () => {
  it("converts a UTC ISO string to a YYYY-MM-DD local date", () => {
    // Noon UTC does not shift the calendar day in any common timezone.
    assert.match(isoToLocalDate("2026-06-15T12:00:00.000Z"), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the expected date for a midday timestamp", () => {
    assert.equal(isoToLocalDate("2026-01-05T12:00:00.000Z"), "2026-01-05");
  });

  it("zero-pads month and day", () => {
    assert.match(isoToLocalDate("2026-03-07T12:00:00.000Z"), /^2026-03-07$/);
  });
});
