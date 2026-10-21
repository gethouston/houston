import { describe, expect, it } from "vitest";
import {
  freeOrgBilling,
  paidOrgBilling,
  withUsage,
} from "./org-billing-fixtures";
import { planUpgradeView } from "./upgrade-model";

describe("persistent free-org upgrade entry", () => {
  it("waits for known billing and disappears on a paid or legacy org", () => {
    expect(planUpgradeView(undefined)).toBeNull();
    expect(planUpgradeView(null)).toBeNull();
    expect(planUpgradeView(paidOrgBilling())).toBeNull();
  });

  it("stays available below the warning and without usage data", () => {
    for (const billing of [
      freeOrgBilling({ usage: null }),
      withUsage(0),
      withUsage(79.9),
    ])
      expect(planUpgradeView(billing)).toEqual({
        status: "free",
        percent: null,
      });
  });

  it("warns at 80 percent and marks the enforced limit at 100", () => {
    expect(planUpgradeView(withUsage(80))).toEqual({
      status: "nearLimit",
      percent: 80,
    });
    expect(planUpgradeView(withUsage(99.9))).toEqual({
      status: "nearLimit",
      percent: 99,
    });
    for (const used of [100, 110])
      expect(planUpgradeView(withUsage(used))).toEqual({
        status: "limit",
        percent: 100,
      });
  });
});
