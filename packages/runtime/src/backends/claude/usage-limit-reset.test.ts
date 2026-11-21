import { expect, test } from "vitest";
import { resetFromText } from "./usage-limit-reset";

const NOW = Date.parse("2026-10-08T20:47:27.000Z");

test("a UTC wall-clock reset is the next such instant", () => {
  expect(
    resetFromText("resets 2am (UTC)", Date.parse("2026-10-08T23:30:00Z")),
  ).toBe("2026-10-09T02:00:00.000Z");
  expect(resetFromText("resets 9:15 pm (GMT)", NOW)).toBe(
    "2026-10-08T21:15:00.000Z",
  );
});

test("a named zone resolves through its own offset", () => {
  expect(resetFromText("resets 5pm (America/Bogota)", NOW)).toBe(
    "2026-10-08T22:00:00.000Z",
  );
  expect(
    resetFromText(
      "You've hit your weekly limit · resets Oct 13, 1am (America/New_York)",
      NOW,
    ),
  ).toBe("2026-10-13T05:00:00.000Z");
});

test("a dated reset with no year is the next such date", () => {
  expect(resetFromText("resets Oct 13, 5am (UTC)", NOW)).toBe(
    "2026-10-13T05:00:00.000Z",
  );
  expect(resetFromText("resets Jan 2, 5am (UTC)", NOW)).toBe(
    "2027-01-02T05:00:00.000Z",
  );
});

test("an unknown zone, a bad clock or no reset at all is null", () => {
  expect(resetFromText("resets 3pm (Mars/Olympus)", NOW)).toBeNull();
  expect(resetFromText("resets 13pm (UTC)", NOW)).toBeNull();
  expect(resetFromText("resets Foo 3, 5am (UTC)", NOW)).toBeNull();
  expect(resetFromText("You've reached your Fable limit.", NOW)).toBeNull();
});

test("a time-only reset further out than a session window is unknown, never +24 h", () => {
  expect(resetFromText("resets 6pm (UTC)", NOW)).toBeNull();
  expect(
    resetFromText("resets 11pm (UTC)", Date.parse("2026-10-08T12:00:00Z")),
  ).toBeNull();
});
