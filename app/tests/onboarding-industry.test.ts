import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isAgentContextId } from "../src/lib/agent-role-catalog.ts";
import { surveyIndustryContext } from "../src/lib/onboarding-industry-context.ts";
import {
  createOnboardingSurveyPreference,
  LEGACY_ONBOARDING_INDUSTRY_CONTEXTS,
  normalizeOnboardingIndustryChoice,
  ONBOARDING_INDUSTRY_SKIPPED,
  ONBOARDING_INDUSTRY_SOMETHING_ELSE,
  parseOnboardingSurveyPreference,
} from "../src/lib/onboarding-survey.ts";

function storedWith(industry: unknown, industryOther: string | null = null) {
  return JSON.stringify({
    ...createOnboardingSurveyPreference(),
    segment: "marketing",
    industry,
    industryOther,
  });
}

describe("legacy survey industries", () => {
  it("folds every legacy id into its nearest catalog context", () => {
    deepStrictEqual(LEGACY_ONBOARDING_INDUSTRY_CONTEXTS, {
      technology: "software_it",
      finance: "finance",
      legal: "legal",
      healthcare: "healthcare",
      education: "education",
      retail: "retail_ecommerce",
      manufacturing: "manufacturing",
      real_estate: "real_estate",
      marketing_agencies: "marketing",
      government_nonprofit: "government",
      consulting: "consulting",
    });
    for (const context of Object.values(LEGACY_ONBOARDING_INDUSTRY_CONTEXTS))
      strictEqual(isAgentContextId(context), true, context);
  });

  it("parses a stored record that holds a legacy id", () => {
    for (const [legacy, context] of Object.entries(
      LEGACY_ONBOARDING_INDUSTRY_CONTEXTS,
    )) {
      strictEqual(
        parseOnboardingSurveyPreference(storedWith(legacy))?.industry,
        context,
        legacy,
      );
    }
  });

  it("keeps the current vocabulary, the door out and the skip as they are", () => {
    strictEqual(
      normalizeOnboardingIndustryChoice("freight_logistics"),
      "freight_logistics",
    );
    strictEqual(
      normalizeOnboardingIndustryChoice(ONBOARDING_INDUSTRY_SOMETHING_ELSE),
      ONBOARDING_INDUSTRY_SOMETHING_ELSE,
    );
    strictEqual(
      normalizeOnboardingIndustryChoice(ONBOARDING_INDUSTRY_SKIPPED),
      ONBOARDING_INDUSTRY_SKIPPED,
    );
    const other = parseOnboardingSurveyPreference(
      storedWith(ONBOARDING_INDUSTRY_SOMETHING_ELSE, "Beekeeping"),
    );
    strictEqual(other?.industry, ONBOARDING_INDUSTRY_SOMETHING_ELSE);
    strictEqual(other?.industryOther, "Beekeeping");
  });

  it("reads an industry this build cannot name as something else", () => {
    strictEqual(
      normalizeOnboardingIndustryChoice("quantum_widgets"),
      ONBOARDING_INDUSTRY_SOMETHING_ELSE,
    );
    strictEqual(
      parseOnboardingSurveyPreference(storedWith("quantum_widgets"))?.industry,
      ONBOARDING_INDUSTRY_SOMETHING_ELSE,
    );
  });

  it("rejects what is not an answer at all", () => {
    strictEqual(normalizeOnboardingIndustryChoice(7), null);
    strictEqual(normalizeOnboardingIndustryChoice(""), null);
    strictEqual(normalizeOnboardingIndustryChoice(undefined), null);
    // An object key is not an id: `toString` must not read as a legacy entry.
    strictEqual(
      normalizeOnboardingIndustryChoice("toString"),
      ONBOARDING_INDUSTRY_SOMETHING_ELSE,
    );
    strictEqual(parseOnboardingSurveyPreference(storedWith(7)), null);
    strictEqual(parseOnboardingSurveyPreference(storedWith("")), null);
  });
});

describe("surveyIndustryContext", () => {
  it("hands a catalog pick over as the context to preselect", () => {
    deepStrictEqual(
      surveyIndustryContext({ industry: "dental", industryOther: null }),
      { contextId: "dental", customLabel: null },
    );
  });

  it("hands something else over as the person's own words", () => {
    deepStrictEqual(
      surveyIndustryContext({
        industry: ONBOARDING_INDUSTRY_SOMETHING_ELSE,
        industryOther: "Beekeeping",
      }),
      { contextId: null, customLabel: "Beekeeping" },
    );
  });

  it("has nothing to preselect when unanswered or declined", () => {
    const none = { contextId: null, customLabel: null };
    deepStrictEqual(surveyIndustryContext(null), none);
    deepStrictEqual(
      surveyIndustryContext({ industry: null, industryOther: null }),
      none,
    );
    deepStrictEqual(
      surveyIndustryContext({
        industry: ONBOARDING_INDUSTRY_SKIPPED,
        industryOther: null,
      }),
      none,
    );
  });
});
