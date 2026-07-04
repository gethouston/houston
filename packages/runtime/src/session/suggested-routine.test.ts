import { expect, test } from "vitest";
import { buildRoutine } from "./suggested-routine";

test("daily builds 5-field cron", () => {
  const r = buildRoutine({
    name: "Morning digest",
    prompt: "Summarize new emails.",
    scheduleType: "daily",
    timeOfDay: "08:00",
  });
  expect(r?.name).toBe("Morning digest");
  expect(r?.schedule).toBe("0 8 * * *");
});

test("weekdays builds cron", () => {
  const r = buildRoutine({
    name: "Standup",
    prompt: "Post standup.",
    scheduleType: "weekdays",
    timeOfDay: "09:30",
  });
  expect(r?.schedule).toBe("30 9 * * 1-5");
});

test("weekly with day of week", () => {
  const r = buildRoutine({
    name: "Report",
    prompt: "Send weekly report.",
    scheduleType: "weekly",
    timeOfDay: "17:00",
    dayOfWeek: 5,
  });
  expect(r?.schedule).toBe("0 17 * * 5");
});

test("weekly without day defaults to Monday", () => {
  const r = buildRoutine({
    name: "R",
    prompt: "P.",
    scheduleType: "weekly",
    timeOfDay: "06:00",
  });
  expect(r?.schedule).toBe("0 6 * * 1");
});

test("null and missing are null", () => {
  expect(buildRoutine(null)).toBeNull();
  expect(buildRoutine(undefined)).toBeNull();
});

test("invalid fields drop to null", () => {
  // Unknown scheduleType.
  expect(
    buildRoutine({
      name: "R",
      prompt: "P",
      scheduleType: "hourly",
      timeOfDay: "08:00",
    }),
  ).toBeNull();
  // Out-of-range time.
  expect(
    buildRoutine({
      name: "R",
      prompt: "P",
      scheduleType: "daily",
      timeOfDay: "25:00",
    }),
  ).toBeNull();
  // Empty name.
  expect(
    buildRoutine({
      name: "",
      prompt: "P",
      scheduleType: "daily",
      timeOfDay: "08:00",
    }),
  ).toBeNull();
  // Out-of-range dayOfWeek falls back to Monday rather than trusting the LLM.
  expect(
    buildRoutine({
      name: "R",
      prompt: "P",
      scheduleType: "weekly",
      timeOfDay: "06:00",
      dayOfWeek: 9,
    })?.schedule,
  ).toBe("0 6 * * 1");
});
