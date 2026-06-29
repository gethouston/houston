import { strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { shouldOfferSkip } from "../src/components/onboarding/missions/email-skip.ts";

describe("shouldOfferSkip (HOU-555 onboarding escape hatch)", () => {
  it("hidden before the agent has run", () => {
    strictEqual(
      shouldOfferSkip({ hasRun: false, isActive: false, setupDone: false }),
      false,
    );
  });

  it("hidden while the agent is still working", () => {
    strictEqual(
      shouldOfferSkip({ hasRun: true, isActive: true, setupDone: false }),
      false,
    );
  });

  it("hidden on the happy path (completion marker seen)", () => {
    strictEqual(
      shouldOfferSkip({ hasRun: true, isActive: false, setupDone: true }),
      false,
    );
  });

  it("shown once the agent ran, went idle, and never confirmed (the stuck case)", () => {
    strictEqual(
      shouldOfferSkip({ hasRun: true, isActive: false, setupDone: false }),
      true,
    );
  });
});
