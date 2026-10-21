import { describe, expect, it } from "vitest";
import {
  FREE_ORG_ROUTINES,
  freeOrgBilling,
  paidOrgBilling,
} from "./org-billing-fixtures";
import { routineScheduleFloor, scheduleFloorRule } from "./schedule-floor";

/**
 * The gateway judges every fire against the org the routine lives in, so the
 * floor is the ACTIVE ORG's tier: neither the editor nor the creator decides.
 */
describe("routineScheduleFloor: the active org's tier decides", () => {
  it("a free org holds every save to its floor", () => {
    expect(routineScheduleFloor(freeOrgBilling())).toBe(15);
  });

  it("a paid org sets none", () => {
    expect(routineScheduleFloor(paidOrgBilling())).toBeUndefined();
  });

  it("follows the minimum the org's billing carries", () => {
    const thirty = freeOrgBilling({
      routines: { ...FREE_ORG_ROUTINES, minIntervalMinutes: 30 },
    });
    expect(routineScheduleFloor(thirty)).toBe(30);
    expect(routineScheduleFloor(freeOrgBilling({ routines: null }))).toBe(15);
  });

  it("sets none before the billing loads and on a legacy org", () => {
    expect(routineScheduleFloor(undefined)).toBeUndefined();
    expect(routineScheduleFloor(null)).toBeUndefined();
  });
});

describe("scheduleFloorRule: what an editor binds", () => {
  it("judges a cron by its real gap, as the host's gate does", () => {
    const rule = scheduleFloorRule(15);
    expect(rule.minutes).toBe(15);
    expect(rule.allows("*/15 * * * *")).toBe(true);
    expect(rule.allows("*/20 * * * *")).toBe(true);
    // :48 then :00: a 12-minute gap, whatever the step says.
    expect(rule.allows("*/16 * * * *")).toBe(false);
    expect(rule.allows("*/5 * * * *")).toBe(false);
    expect(rule.allows("0 9 * * *")).toBe(true);
  });

  it("judges an @every interval by its step: it runs exactly that far apart", () => {
    const rule = scheduleFloorRule(15);
    expect(rule.allows("@every 16m")).toBe(true);
    expect(rule.allows("@every 15m")).toBe(true);
    expect(rule.allows("@every 5h")).toBe(true);
    expect(rule.allows("@every 14m")).toBe(false);
    expect(rule.allows("@every 7m")).toBe(false);
  });
});
