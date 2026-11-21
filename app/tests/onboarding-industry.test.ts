import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isAgentContextId } from "../src/lib/agent-role-catalog.ts";
import {
  surveyIndustryContext,
  surveyLeadershipRole,
  surveyRoleContext,
} from "../src/lib/onboarding-industry-context.ts";
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
    role: "paralegal",
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

describe("surveyRoleContext", () => {
  const none = { roleId: null, customLabel: null };
  it("preselects a catalog role", () => {
    deepStrictEqual(surveyRoleContext({ role: "paralegal", roleOther: null }), {
      roleId: "paralegal",
      customLabel: null,
    });
  });

  it("carries the words behind something else", () => {
    deepStrictEqual(
      surveyRoleContext({ role: "something_else", roleOther: "Groomer" }),
      { roleId: null, customLabel: "Groomer" },
    );
  });

  it("has nothing to preselect for a skip, a missing record or no answer", () => {
    deepStrictEqual(surveyRoleContext(null), none);
    deepStrictEqual(surveyRoleContext({ role: null, roleOther: null }), none);
    deepStrictEqual(
      surveyRoleContext({ role: "skipped", roleOther: null }),
      none,
    );
  });

  it("never turns a leadership position into a job to hire for", () => {
    for (const role of ["founder", "ceo", "manager"] as const)
      deepStrictEqual(surveyRoleContext({ role, roleOther: null }), none);
  });
});

describe("surveyLeadershipRole", () => {
  it("preselects the person's own position, and nothing else", () => {
    strictEqual(surveyLeadershipRole({ role: "co_founder" }), "co_founder");
    strictEqual(surveyLeadershipRole({ role: "paralegal" }), null);
    strictEqual(surveyLeadershipRole({ role: "something_else" }), null);
    strictEqual(surveyLeadershipRole({ role: null }), null);
    strictEqual(surveyLeadershipRole(null), null);
  });
});
