import { describe, expect, it } from "vitest";
import {
  ONBOARDING_ANSWER_SKIPPED,
  ONBOARDING_ANSWER_SOMETHING_ELSE,
  ONBOARDING_COMPANY_SIZES,
  ONBOARDING_INVALID_ROLE,
  type OnboardingRecordWire,
  type OnboardingUpdateWire,
} from "./onboarding.ts";

describe("onboarding wire contract", () => {
  it("pins the two answers outside a catalog and the role refusal", () => {
    expect(ONBOARDING_ANSWER_SKIPPED).toBe("skipped");
    expect(ONBOARDING_ANSWER_SOMETHING_ELSE).toBe("something_else");
    expect(ONBOARDING_INVALID_ROLE).toBe("invalid_role");
  });

  it("pins the company-size buckets, smallest first", () => {
    expect(ONBOARDING_COMPANY_SIZES).toEqual([
      "solo",
      "2_10",
      "11_50",
      "51_200",
      "201_1000",
      "1000_plus",
    ]);
  });

  it("names every field of the record and the update", () => {
    const record: Record<keyof OnboardingRecordWire, true> = {
      segment: true,
      role: true,
      industry: true,
      companySize: true,
      automationGoal: true,
      goalSkipped: true,
      segmentAnsweredAt: true,
      roleAnsweredAt: true,
      industryAnsweredAt: true,
      companySizeAnsweredAt: true,
      goalAnsweredAt: true,
    };
    const update: Record<keyof OnboardingUpdateWire, true> = {
      role: true,
      industry: true,
      companySize: true,
      automationGoal: true,
      goalSkipped: true,
      segment: true,
    };
    expect(Object.keys(record)).toHaveLength(11);
    expect(Object.keys(update)).toHaveLength(6);
  });
});
