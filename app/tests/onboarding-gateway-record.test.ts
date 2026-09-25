import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  mergeGatewayOnboarding,
  parseGatewayOnboarding,
} from "../src/lib/onboarding-gateway-record.ts";

const remote = (industry: string | null) => ({
  segment: null,
  industry,
  automationGoal: null,
  goalSkipped: false,
  segmentAnsweredAt: null,
  industryAnsweredAt: null,
  goalAnsweredAt: null,
});

describe("gateway industry ids read through the normalizer", () => {
  it("parse maps a legacy survey id to its catalog context", () => {
    strictEqual(
      parseGatewayOnboarding({ industry: "technology" })?.industry,
      "software_it",
    );
    strictEqual(
      parseGatewayOnboarding({ industry: "marketing_agencies" })?.industry,
      "marketing",
    );
  });

  it("parse keeps a current catalog id and reads a non-string as unanswered", () => {
    strictEqual(
      parseGatewayOnboarding({ industry: "software_it" })?.industry,
      "software_it",
    );
    strictEqual(parseGatewayOnboarding({ industry: 7 })?.industry, null);
  });

  it("merge folds a legacy remote id into the local record", () => {
    strictEqual(
      mergeGatewayOnboarding(null, remote("real_estate"))?.industry,
      "real_estate",
    );
    strictEqual(
      mergeGatewayOnboarding(null, remote("retail"))?.industry,
      "retail_ecommerce",
    );
  });
});
