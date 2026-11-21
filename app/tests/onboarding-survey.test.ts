import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import type { LegacySegmentPreference } from "../src/lib/onboarding-legacy-segment.ts";
import {
  applyCompanySize,
  applyCompletionDismissed,
  applyGoal,
  applyGoalSkipped,
  applyIndustry,
  applyRole,
  createOnboardingSurveyPreference,
  isCompanySizeAnswered,
  isGoalAnswered,
  isIndustryAnswered,
  isOnboardingCompanySizeChoice,
  isOnboardingIndustry,
  isOnboardingIndustryChoice,
  isOnboardingRole,
  isOnboardingRoleChoice,
  isRoleAnswered,
  isValidAutomationGoal,
  liftLegacySegmentPreference,
  markGatewaySynced,
  needsCompletionPrompt,
  normalizeOnboardingCompanySizeChoice,
  normalizeOnboardingRoleChoice,
  ONBOARDING_COMPANY_SIZE_SKIPPED,
  ONBOARDING_GOAL_MAX_LENGTH,
  ONBOARDING_INDUSTRY_SKIPPED,
  ONBOARDING_INDUSTRY_SOMETHING_ELSE,
  ONBOARDING_ROLE_SKIPPED,
  ONBOARDING_ROLE_SOMETHING_ELSE,
  ONBOARDING_SURVEY_PREF_KEY,
  ONBOARDING_SURVEY_VERSION,
  type OnboardingSurveyPreference,
  onboardingSurveyLocalKey,
  parseOnboardingSurveyPreference,
  serializeOnboardingSurveyPreference,
} from "../src/lib/onboarding-survey.ts";

function answered(
  overrides: Partial<OnboardingSurveyPreference> = {},
): OnboardingSurveyPreference {
  return {
    ...createOnboardingSurveyPreference(),
    role: "store_manager",
    industry: "software_it",
    companySize: "51_200",
    automationGoal: "Chase overdue invoices every Monday",
    ...overrides,
  };
}

describe("onboarding survey ids", () => {
  it("pins the pref key and version", () => {
    strictEqual(ONBOARDING_SURVEY_PREF_KEY, "houston_onboarding_survey");
    strictEqual(ONBOARDING_SURVEY_VERSION, 2);
  });

  it("accepts the hire catalog's contexts and the door out of them", () => {
    strictEqual(isOnboardingIndustry("healthcare"), true);
    strictEqual(isOnboardingIndustry("software_it"), true);
    strictEqual(isOnboardingIndustry(ONBOARDING_INDUSTRY_SOMETHING_ELSE), true);
    strictEqual(isOnboardingIndustry("crypto free text"), false);
    strictEqual(isOnboardingIndustry("government_nonprofit"), false);
    strictEqual(isOnboardingIndustry(ONBOARDING_INDUSTRY_SKIPPED), false);
    strictEqual(isOnboardingIndustryChoice(ONBOARDING_INDUSTRY_SKIPPED), true);
    strictEqual(isOnboardingIndustryChoice("retail_ecommerce"), true);
    strictEqual(isOnboardingIndustryChoice("retail"), false);
    strictEqual(isOnboardingIndustryChoice("crypto free text"), false);
  });

  it("accepts the hire catalog's roles and the door out of them", () => {
    strictEqual(isOnboardingRole("paralegal"), true);
    strictEqual(isOnboardingRole(ONBOARDING_ROLE_SOMETHING_ELSE), true);
    strictEqual(isOnboardingRole("marketing"), false);
    strictEqual(isOnboardingRole(ONBOARDING_ROLE_SKIPPED), false);
    strictEqual(isOnboardingRoleChoice(ONBOARDING_ROLE_SKIPPED), true);
    strictEqual(isOnboardingRoleChoice("my own free text"), false);
  });

  it("accepts the leadership positions as the person's role", () => {
    strictEqual(isOnboardingRole("founder"), true);
    strictEqual(isOnboardingRole("ceo"), true);
    strictEqual(isOnboardingRoleChoice("head_of_department"), true);
    strictEqual(normalizeOnboardingRoleChoice("co_founder"), "co_founder");
  });

  it("accepts the company-size buckets and the skip, nothing else", () => {
    for (const size of ["solo", "2_10", "1000_plus", "skipped"])
      strictEqual(isOnboardingCompanySizeChoice(size), true, size);
    strictEqual(isOnboardingCompanySizeChoice("huge"), false);
    strictEqual(isOnboardingCompanySizeChoice(""), false);
    strictEqual(normalizeOnboardingCompanySizeChoice("11_50"), "11_50");
    strictEqual(normalizeOnboardingCompanySizeChoice("5000_plus"), null);
    strictEqual(normalizeOnboardingCompanySizeChoice(7), null);
  });

  it("reads a role this build cannot name as answered, never as a question", () => {
    strictEqual(normalizeOnboardingRoleChoice("paralegal"), "paralegal");
    strictEqual(normalizeOnboardingRoleChoice("skipped"), "skipped");
    strictEqual(
      normalizeOnboardingRoleChoice("role_from_a_newer_catalog"),
      ONBOARDING_ROLE_SOMETHING_ELSE,
    );
    strictEqual(normalizeOnboardingRoleChoice(""), null);
    strictEqual(normalizeOnboardingRoleChoice(7), null);
  });

  it("shares one skip sentinel across the questions", () => {
    strictEqual(ONBOARDING_INDUSTRY_SKIPPED, ONBOARDING_ROLE_SKIPPED);
    strictEqual(ONBOARDING_COMPANY_SIZE_SKIPPED, ONBOARDING_ROLE_SKIPPED);
    strictEqual(ONBOARDING_INDUSTRY_SKIPPED, "skipped");
  });

  it("scopes the localStorage mirror key by uid", () => {
    strictEqual(
      onboardingSurveyLocalKey("uid-1"),
      "houston.onboarding-survey.uid-1",
    );
    strictEqual(
      onboardingSurveyLocalKey(null),
      "houston.onboarding-survey.local",
    );
  });
});

describe("onboarding survey goal validation", () => {
  it("requires 1 to 2000 characters once trimmed", () => {
    strictEqual(isValidAutomationGoal("a"), true);
    strictEqual(isValidAutomationGoal(" a "), true);
    strictEqual(
      isValidAutomationGoal("x".repeat(ONBOARDING_GOAL_MAX_LENGTH)),
      true,
    );
    strictEqual(
      isValidAutomationGoal("x".repeat(ONBOARDING_GOAL_MAX_LENGTH + 1)),
      false,
    );
    strictEqual(isValidAutomationGoal(""), false);
    strictEqual(isValidAutomationGoal("   \n\t "), false);
    strictEqual(isValidAutomationGoal(null), false);
    strictEqual(isValidAutomationGoal(42), false);
  });

  it("measures the limit in code points, like the server does", () => {
    const emoji = "🙂";
    strictEqual(emoji.length, 2);
    strictEqual(
      isValidAutomationGoal(emoji.repeat(ONBOARDING_GOAL_MAX_LENGTH)),
      true,
    );
    strictEqual(
      isValidAutomationGoal(emoji.repeat(ONBOARDING_GOAL_MAX_LENGTH + 1)),
      false,
    );
  });

  it("sees an over-cap emoji paste as over-cap, not as a full-length answer", () => {
    const paste = "🙂".repeat(ONBOARDING_GOAL_MAX_LENGTH + 500);
    strictEqual([...paste].length, ONBOARDING_GOAL_MAX_LENGTH + 500);
    strictEqual(isValidAutomationGoal(paste), false);
    strictEqual(
      isValidAutomationGoal(paste.slice(0, ONBOARDING_GOAL_MAX_LENGTH * 2)),
      true,
    );
    throws(
      () => applyGoal(createOnboardingSurveyPreference(), paste),
      RangeError,
    );
  });

  it("stores the trimmed goal and rejects an unusable one", () => {
    const record = applyGoal(createOnboardingSurveyPreference(), "  ship it  ");
    strictEqual(record.automationGoal, "ship it");
    strictEqual(record.goalSkipped, false);
    throws(() => applyGoal(record, "   "), RangeError);
    throws(
      () => applyGoal(record, "x".repeat(ONBOARDING_GOAL_MAX_LENGTH + 1)),
      RangeError,
    );
  });
});

describe("onboarding survey persistence", () => {
  it("round-trips a fully answered record", () => {
    const record = answered({ gatewaySyncedAt: "2026-08-08T10:00:00.000Z" });
    deepStrictEqual(
      parseOnboardingSurveyPreference(
        serializeOnboardingSurveyPreference(record),
      ),
      record,
    );
  });

  it("round-trips skipped answers so the survey never re-prompts", () => {
    const record = applyGoalSkipped(
      applyCompanySize(
        applyIndustry(
          applyRole(
            createOnboardingSurveyPreference(),
            ONBOARDING_ROLE_SKIPPED,
          ),
          ONBOARDING_INDUSTRY_SKIPPED,
        ),
        ONBOARDING_COMPANY_SIZE_SKIPPED,
      ),
    );
    deepStrictEqual(
      parseOnboardingSurveyPreference(
        serializeOnboardingSurveyPreference(record),
      ),
      record,
    );
  });

  it("rejects corrupt, foreign or unknown persisted values", () => {
    strictEqual(parseOnboardingSurveyPreference(null), null);
    strictEqual(parseOnboardingSurveyPreference("   "), null);
    strictEqual(parseOnboardingSurveyPreference("{bad json"), null);
    strictEqual(parseOnboardingSurveyPreference('"a string"'), null);
    const reject = (overrides: Record<string, unknown>) =>
      strictEqual(
        parseOnboardingSurveyPreference(
          JSON.stringify({ ...answered(), ...overrides }),
        ),
        null,
      );
    reject({ version: 1 });
    reject({ version: undefined });
    reject({ industry: undefined });
    reject({ industry: 7 });
    reject({ automationGoal: "" });
    reject({ automationGoal: "x".repeat(ONBOARDING_GOAL_MAX_LENGTH + 1) });
    reject({ automationGoal: 7 });
    reject({ goalSkipped: "yes" });
    reject({ completionPromptDismissed: null });
    reject({ updatedAt: "not a date" });
    reject({ gatewaySyncedAt: "not a date" });
  });

  it("reads the role and the retired department leniently", () => {
    const parse = (overrides: Record<string, unknown>) =>
      parseOnboardingSurveyPreference(
        JSON.stringify({ ...answered(), ...overrides }),
      );
    const before = parse({ role: undefined, roleOther: undefined });
    strictEqual(before?.role, null);
    strictEqual(before?.roleOther, null);
    strictEqual(parse({ role: "newer_role" })?.role, "something_else");
    strictEqual(parse({ segment: "founder" })?.segment, "founder");
    strictEqual(parse({ segment: 7 })?.segment, null);
    strictEqual(parse({ segment: undefined })?.segment, null);
    strictEqual(parse({ roleOther: "x".repeat(201) })?.roleOther, null);
  });

  it("reads a record written before the company size existed as unanswered", () => {
    const parse = (overrides: Record<string, unknown>) =>
      parseOnboardingSurveyPreference(
        JSON.stringify({ ...answered(), ...overrides }),
      );
    const before = parse({ companySize: undefined });
    strictEqual(before?.companySize, null);
    strictEqual(before?.automationGoal, "Chase overdue invoices every Monday");
    strictEqual(parse({ companySize: "solo" })?.companySize, "solo");
    strictEqual(parse({ companySize: "huge" })?.companySize, null);
  });

  it("normalizes a whitespace-padded goal on read", () => {
    const parsed = parseOnboardingSurveyPreference(
      JSON.stringify(answered({ automationGoal: "  file my VAT  " })),
    );
    strictEqual(parsed?.automationGoal, "file my VAT");
  });
});

describe("onboarding survey updates", () => {
  it("starts empty, unanswered and unsynced", () => {
    const record = createOnboardingSurveyPreference();
    deepStrictEqual(
      { ...record, updatedAt: "" },
      {
        version: ONBOARDING_SURVEY_VERSION,
        segment: null,
        role: null,
        roleOther: null,
        industry: null,
        industryOther: null,
        companySize: null,
        automationGoal: null,
        goalSkipped: false,
        completionPromptDismissed: false,
        updatedAt: "",
        gatewaySyncedAt: null,
      },
    );
    strictEqual(Number.isNaN(Date.parse(record.updatedAt)), false);
  });

  it("leaves the input untouched and clears the sync stamp on every ANSWER", () => {
    const synced = markGatewaySynced(answered(), "2026-08-08T10:00:00.000Z");
    for (const next of [
      applyRole(synced, "paralegal"),
      applyIndustry(synced, "finance"),
      applyCompanySize(synced, "solo"),
      applyGoal(synced, "book my travel"),
      applyGoalSkipped(synced),
    ]) {
      strictEqual(next.gatewaySyncedAt, null);
      strictEqual(Number.isNaN(Date.parse(next.updatedAt)), false);
    }
    strictEqual(synced.gatewaySyncedAt, "2026-08-08T10:00:00.000Z");
    strictEqual(synced.role, "store_manager");
  });

  it("keeps a synced record synced when only local UI state changes", () => {
    const synced = markGatewaySynced(answered(), "2026-08-08T10:00:00.000Z");
    const dismissed = applyCompletionDismissed(synced);
    strictEqual(dismissed.completionPromptDismissed, true);
    strictEqual(dismissed.gatewaySyncedAt, "2026-08-08T10:00:00.000Z");
    strictEqual(dismissed.updatedAt, synced.updatedAt);
    strictEqual(synced.completionPromptDismissed, false);
    strictEqual(applyCompletionDismissed(answered()).gatewaySyncedAt, null);
  });

  it("keeps the role's own words for something else alone", () => {
    const custom = applyRole(answered(), "something_else", "  Groomer ");
    strictEqual(custom.roleOther, "Groomer");
    strictEqual(applyRole(custom, "paralegal").roleOther, null);
  });

  it("keeps the goal text and the skip flag mutually exclusive", () => {
    const skipped = applyGoalSkipped(answered());
    strictEqual(skipped.automationGoal, null);
    strictEqual(skipped.goalSkipped, true);
    const written = applyGoal(skipped, "reconcile Stripe payouts");
    strictEqual(written.automationGoal, "reconcile Stripe payouts");
    strictEqual(written.goalSkipped, false);
  });

  it("stamps a gateway sync without touching updatedAt, and rejects junk", () => {
    const record = answered();
    const synced = markGatewaySynced(record, "2026-08-08T10:00:00.000Z");
    strictEqual(synced.gatewaySyncedAt, "2026-08-08T10:00:00.000Z");
    strictEqual(synced.updatedAt, record.updatedAt);
    throws(() => markGatewaySynced(record, "whenever"), RangeError);
  });
});

const legacy = (segment: string): LegacySegmentPreference => ({
  segment,
  selectedAt: "2026-07-09T00:00:00.000Z",
});

describe("onboarding survey legacy lift", () => {
  it("carries the legacy department into a survey record", () => {
    deepStrictEqual(liftLegacySegmentPreference(legacy("operations")), {
      version: ONBOARDING_SURVEY_VERSION,
      segment: "operations",
      role: null,
      roleOther: null,
      industry: null,
      industryOther: null,
      companySize: null,
      automationGoal: null,
      goalSkipped: false,
      completionPromptDismissed: false,
      updatedAt: "2026-07-09T00:00:00.000Z",
      gatewaySyncedAt: null,
    });
  });

  it("carries a legacy skip too, and lifts nothing when there is nothing", () => {
    strictEqual(
      liftLegacySegmentPreference(legacy("skipped"))?.segment,
      "skipped",
    );
    strictEqual(liftLegacySegmentPreference(null), null);
  });

  it("produces a record its own parser accepts", () => {
    const lifted = liftLegacySegmentPreference(legacy("design"));
    if (!lifted) throw new Error("expected a lifted record");
    deepStrictEqual(
      parseOnboardingSurveyPreference(
        serializeOnboardingSurveyPreference(lifted),
      ),
      lifted,
    );
  });

  it("falls back to now when the legacy stamp is unparseable", () => {
    const lifted = liftLegacySegmentPreference({
      ...legacy("sales"),
      selectedAt: "whenever",
    });
    strictEqual(Number.isNaN(Date.parse(lifted?.updatedAt ?? "")), false);
  });
});

describe("onboarding survey answered semantics", () => {
  it("counts a skip as an answer", () => {
    const skippedAll = applyGoalSkipped(
      applyCompanySize(
        applyIndustry(
          applyRole(
            createOnboardingSurveyPreference(),
            ONBOARDING_ROLE_SKIPPED,
          ),
          ONBOARDING_INDUSTRY_SKIPPED,
        ),
        ONBOARDING_COMPANY_SIZE_SKIPPED,
      ),
    );
    strictEqual(isRoleAnswered(skippedAll), true);
    strictEqual(isIndustryAnswered(skippedAll), true);
    strictEqual(isCompanySizeAnswered(skippedAll), true);
    strictEqual(isGoalAnswered(skippedAll), true);
    strictEqual(needsCompletionPrompt(skippedAll), false);
  });

  it("counts a department answered before the role question as the role", () => {
    const legacyOnly = {
      ...createOnboardingSurveyPreference(),
      segment: "operations",
    };
    strictEqual(isRoleAnswered(legacyOnly), true);
  });

  it("treats a missing record as unanswered", () => {
    strictEqual(isRoleAnswered(null), false);
    strictEqual(isIndustryAnswered(null), false);
    strictEqual(isCompanySizeAnswered(null), false);
    strictEqual(isGoalAnswered(null), false);
    strictEqual(needsCompletionPrompt(null), false);
  });

  it("prompts only someone whose job is answered, with a gap, who has not dismissed it", () => {
    const jobOnly = {
      ...createOnboardingSurveyPreference(),
      segment: "product",
    };
    strictEqual(needsCompletionPrompt(jobOnly), true);
    strictEqual(
      needsCompletionPrompt(applyIndustry(jobOnly, "education")),
      true,
    );
    strictEqual(
      needsCompletionPrompt(
        applyGoal(applyIndustry(jobOnly, "education"), "sort my inbox"),
      ),
      true,
    );
    strictEqual(
      needsCompletionPrompt(
        applyCompanySize(
          applyGoal(applyIndustry(jobOnly, "education"), "sort my inbox"),
          "2_10",
        ),
      ),
      false,
    );
    const beforeSize = answered({ companySize: null });
    strictEqual(needsCompletionPrompt(beforeSize), true);
    strictEqual(
      needsCompletionPrompt(applyCompletionDismissed(beforeSize)),
      false,
    );
    strictEqual(
      needsCompletionPrompt(applyCompletionDismissed(jobOnly)),
      false,
    );
    strictEqual(
      needsCompletionPrompt(
        applyRole(createOnboardingSurveyPreference(), "paralegal"),
      ),
      true,
    );
    strictEqual(
      needsCompletionPrompt(createOnboardingSurveyPreference()),
      false,
    );
  });
});
