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

describe("required onboarding role selection", () => {
  it("keeps the in-card helper and skip removed, subtitles to five words", () => {
    const screen = read("../src/components/onboarding/survey-screen.tsx");
    const copy = read("../src/components/onboarding/survey-copy.ts");
    const locales = ["en", "es", "pt"] as const;

    // The role question itself stays required: no in-card helper or
    // per-question skip copy. NO question carries a skip of its own, the
    // free-text goal included — and the survey as a whole is mandatory too
    // (no global escape hatch; covered in onboarding-escape-hatch.test.ts).
    assert.doesNotMatch(copy, /onboardingSegment\.(?:helper|skip)/);
    assert.doesNotMatch(screen, /onSkipQuestion|skipGoal/);

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
