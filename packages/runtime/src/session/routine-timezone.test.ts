import { expect, test } from "vitest";
import { withRoutineTimezone } from "./routine-timezone";

test.each([
  "America/Bogota",
  undefined,
])("the coordinator schedules each employee in its own zone, manager zone=%s", (timezone) => {
  const prompt = withRoutineTimezone("Product prompt", timezone, "coordinator");
  expect(prompt).toBe(
    "Product prompt\n\nEach AI employee's routines run in its own time zone, shown on the employee; write the cron in that zone's local time and never add a time zone to it.",
  );
  expect(prompt).not.toContain("Routines run in America/Bogota");
});

test("an ordinary agent describes only its own routines", () => {
  expect(withRoutineTimezone("Product prompt", "Asia/Tokyo", null)).toBe(
    "Product prompt\n\nRoutines run in Asia/Tokyo. Write the cron in that local time and never add a time zone to it.",
  );
  expect(withRoutineTimezone("Product prompt", undefined, null)).toBe(
    "Product prompt",
  );
});
