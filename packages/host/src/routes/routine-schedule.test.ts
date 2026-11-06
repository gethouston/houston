import { hostTimezone, setPreference } from "@houston/domain";
import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { checkedSchedule } from "./routine-schedule";

test.each([
  null,
  "Mars/Olympus",
])("schedule refusals name the real fallback zone for %s", async (value) => {
  const vfs = new MemoryVfs();
  await setPreference(vfs, "Work", "timezone", value);
  expect(
    await checkedSchedule(vfs, "Work", "CRON_TZ=Asia/Tokyo 0 9 * * *"),
  ).toEqual({
    error: `invalid schedule: Leave the time zone out of the schedule: routines run in ${hostTimezone()}. Write the cron in that local time.`,
  });
  expect(await checkedSchedule(vfs, "Work", "0 9 * * *")).toEqual({
    schedule: "0 9 * * *",
  });
});
