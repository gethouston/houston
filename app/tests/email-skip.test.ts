import { strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { shouldOfferSkip } from "../src/components/onboarding/missions/email-skip.ts";

describe("shouldOfferSkip (HOU-555 onboarding escape hatch)", () => {
  it("hidden before the first message starts the AI conversation", () => {
    strictEqual(
      shouldOfferSkip({ hasFirstMessage: false, setupDone: false }),
      false,
    );
  });

  it("appears as soon as the first message starts the AI conversation", () => {
    strictEqual(
      shouldOfferSkip({ hasFirstMessage: true, setupDone: false }),
      true,
    );
  });

  it("hidden on the happy path (completion marker seen)", () => {
    strictEqual(
      shouldOfferSkip({ hasFirstMessage: true, setupDone: true }),
      false,
    );
  });
});
