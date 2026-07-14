import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createOnboardingSegmentPreference,
  isOnboardingSegment,
  ONBOARDING_SEGMENT_SOURCE_SCREEN,
  parseOnboardingSegmentPreference,
} from "../src/lib/onboarding-segment.ts";

describe("onboarding segment preference", () => {
  it("accepts only known segment ids", () => {
    strictEqual(isOnboardingSegment("business_owner"), true);
    strictEqual(isOnboardingSegment("finance_accounting"), true);
    strictEqual(isOnboardingSegment("founder_free_text"), false);
  });

  it("parses a valid persisted preference", () => {
    const raw = JSON.stringify({
      segment: "operations",
      selectedAt: "2026-07-09T00:00:00.000Z",
      sourceScreen: ONBOARDING_SEGMENT_SOURCE_SCREEN,
    });

    deepStrictEqual(parseOnboardingSegmentPreference(raw), {
      segment: "operations",
      selectedAt: "2026-07-09T00:00:00.000Z",
      sourceScreen: ONBOARDING_SEGMENT_SOURCE_SCREEN,
    });
  });

  it("rejects corrupt or unknown persisted values", () => {
    strictEqual(parseOnboardingSegmentPreference(null), null);
    strictEqual(parseOnboardingSegmentPreference("{bad json"), null);
    strictEqual(
      parseOnboardingSegmentPreference(
        JSON.stringify({
          segment: "custom sensitive text",
          selectedAt: "2026-07-09T00:00:00.000Z",
          sourceScreen: ONBOARDING_SEGMENT_SOURCE_SCREEN,
        }),
      ),
      null,
    );
  });

  it("creates the stored record with the fixed source screen", () => {
    const record = createOnboardingSegmentPreference("legal");
    strictEqual(record.segment, "legal");
    strictEqual(record.sourceScreen, ONBOARDING_SEGMENT_SOURCE_SCREEN);
    strictEqual(Number.isNaN(Date.parse(record.selectedAt)), false);
  });
});
