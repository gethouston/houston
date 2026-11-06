import { expect, test } from "vitest";
import { validateSchedule } from "./schedule";

test.each([
  "CRON_TZ=America/New_York",
  "TZ=America/New_York",
  "  TZ=UTC",
])("%s is refused before cron parsing", (prefix) => {
  expect(validateSchedule(`${prefix} 0 9 * * *`, "America/Bogota")).toBe(
    "Leave the time zone out of the schedule: routines run in America/Bogota. Write the cron in that local time.",
  );
  expect(validateSchedule(`${prefix} 0 9 * * *`)).toBe(
    "Leave the time zone out of the schedule: routines run in the deployment's local time zone. Write the cron in that local time.",
  );
});
