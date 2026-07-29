import assert from "node:assert/strict";
import test from "node:test";
import { formatModified, formatModifiedFull } from "../src/format-modified.ts";

/**
 * "Now" is a Thursday at midday, so the six-day weekday window and the
 * calendar-year boundary are both reachable from it without ambiguity.
 */
const NOW = new Date(2026, 6, 23, 12, 0, 0).getTime(); // Thu 23 Jul 2026
const DAY = 86_400_000;
const at = (daysAgo: number, hour = 9) =>
  new Date(2026, 6, 23 - daysAgo, hour, 30, 0).getTime();

test("the current calendar day gets the caller's Today word", () => {
  assert.equal(formatModified(NOW, NOW, "en-US", "Today"), "Today");
  // Same day, hours earlier: still today, not "23 hours ago".
  assert.equal(formatModified(at(0, 0), NOW, "en-US", "Today"), "Today");
});

test("yesterday reads as its weekday, not a date", () => {
  assert.equal(formatModified(at(1), NOW, "en-US", "Today"), "Wednesday");
});

test("the sixth day back is still a weekday", () => {
  assert.equal(formatModified(at(6), NOW, "en-US", "Today"), "Friday");
});

test("the seventh day back becomes a date", () => {
  assert.equal(formatModified(at(7), NOW, "en-US", "Today"), "Jul 16");
});

test("earlier in the same calendar year: month and day, no year", () => {
  const jan = new Date(2026, 0, 4, 8, 0, 0).getTime();
  assert.equal(formatModified(jan, NOW, "en-US", "Today"), "Jan 4");
});

test("a previous year carries its year", () => {
  const lastYear = new Date(2025, 6, 24, 8, 0, 0).getTime();
  assert.equal(formatModified(lastYear, NOW, "en-US", "Today"), "Jul 24, 2025");
});

test("the wording follows the locale", () => {
  assert.equal(formatModified(at(1), NOW, "es", "Hoy"), "miércoles");
  assert.equal(formatModified(NOW, NOW, "es", "Hoy"), "Hoy");
  // A Portuguese month, not an English one, once it is past the weekday window.
  assert.match(formatModified(at(30), NOW, "pt-BR", "Hoje"), /jun/i);
});

test("a missing timestamp shows a dash instead of inventing a date", () => {
  assert.equal(formatModified(undefined, NOW, "en-US", "Today"), "—");
  assert.equal(formatModified(0, NOW, "en-US", "Today"), "—");
  assert.equal(formatModifiedFull(undefined, "en-US"), undefined);
});

test("a clock-skewed future stamp states its date rather than a weekday", () => {
  assert.equal(formatModified(NOW + 3 * DAY, NOW, "en-US", "Today"), "Jul 26");
});

test("the tooltip spells the whole localized date and time", () => {
  const full = formatModifiedFull(
    new Date(2025, 6, 24, 15, 5).getTime(),
    "en-US",
  );
  assert.match(full ?? "", /July 24, 2025/);
});
