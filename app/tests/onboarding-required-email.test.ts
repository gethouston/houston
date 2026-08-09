import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

type SegmentCopy = {
  subtitle: string;
  helper?: unknown;
  skip?: unknown;
};

describe("required onboarding email path", () => {
  it("renders one focused email action before the first agent message", () => {
    const offer = read(
      "../src/components/onboarding/missions/email-offer-action.tsx",
    );
    const mission = read("../src/components/onboarding/missions/email.tsx");

    assert.match(offer, /type="button"/);
    assert.equal((offer.match(/<Button\b/g) ?? []).length, 1);
    assert.match(offer, /onClick={onStart}/);
    assert.match(offer, /ring-focus/);
    assert.doesNotMatch(offer, /<(?:input|textarea)\b/i);
    assert.doesNotMatch(offer, /\b(?:skip|onSkip|omit)\b/i);
    assert.match(mission, /<EmailOfferAction/);
    assert.doesNotMatch(mission, /<ChatInteractionCard/);
  });

  it("keeps every in-card skip route out of the pre-conversation steps", () => {
    const connectEmail = read(
      "../src/components/onboarding/missions/connect-email.tsx",
    );
    const flow = read(
      "../src/components/onboarding/missions/onboarding-flow.ts",
    );
    const onboarding = read(
      "../src/components/onboarding/personal-assistant-onboarding.tsx",
    );
    const session = read(
      "../src/components/onboarding/missions/use-email-mission-session.ts",
    );

    assert.doesNotMatch(connectEmail, /\b(?:onSkip|ConfirmDialog)\b/);
    assert.doesNotMatch(connectEmail, /\b(?:skip|omit)\b/i);
    assert.doesNotMatch(flow, /shouldOfferConnectSkip/);
    assert.doesNotMatch(onboarding, /skipEmailSteps/);
    // The in-card skip stays failure-gated: the session derives `showSkip`
    // from shouldOfferSkip (behavior covered in email-skip.test.ts). The one
    // always-available exit is the bottom-of-screen support escape hatch,
    // covered in onboarding-escape-hatch.test.ts.
    assert.match(session, /showSkip = shouldOfferSkip\(\{/);
  });
});

describe("required onboarding role selection", () => {
  it("keeps the in-card helper and skip removed, subtitles to five words", () => {
    const screen = read("../src/components/onboarding/survey-screen.tsx");
    const copy = read("../src/components/onboarding/survey-copy.ts");
    const locales = ["en", "es", "pt"] as const;

    // The role question itself stays required: no in-card helper or
    // per-question skip copy. NO question carries a skip of its own any more,
    // the free-text goal included; the only exit is the global
    // bottom-of-screen SkipOnboardingButton escape hatch, which leaves ALL of
    // onboarding (covered in onboarding-escape-hatch.test.ts).
    assert.doesNotMatch(copy, /onboardingSegment\.(?:helper|skip)/);
    assert.doesNotMatch(screen, /onSkipQuestion|skipGoal/);
    assert.match(screen, /<SkipOnboardingButton onSkip=\{onDismiss\} \/>/);

    for (const locale of locales) {
      const setup = JSON.parse(read(`../src/locales/${locale}/setup.json`)) as {
        onboardingSegment: SegmentCopy;
      };
      const segment = setup.onboardingSegment;

      assert.equal(segment.helper, undefined, `${locale} has no helper copy`);
      assert.equal(segment.skip, undefined, `${locale} has no skip copy`);
      assert.ok(
        segment.subtitle.trim().split(/\s+/u).length <= 5,
        `${locale} subtitle has at most five words`,
      );
    }
  });
});
