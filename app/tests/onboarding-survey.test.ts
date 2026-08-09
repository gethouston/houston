import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import { createOnboardingSegmentPreference } from "../src/lib/onboarding-segment.ts";
import {
  applyCompletionDismissed,
  applyGoal,
  applyGoalSkipped,
  applyIndustry,
  applySegment,
  createOnboardingSurveyPreference,
  isGoalAnswered,
  isIndustryAnswered,
  isOnboardingIndustry,
  isOnboardingIndustryChoice,
  isSegmentAnswered,
  isValidAutomationGoal,
  liftLegacySegmentPreference,
  markGatewaySynced,
  needsCompletionPrompt,
  ONBOARDING_GOAL_MAX_LENGTH,
  ONBOARDING_INDUSTRIES,
  ONBOARDING_INDUSTRY_SKIPPED,
  ONBOARDING_SEGMENT_SKIPPED,
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
    segment: "marketing",
    industry: "technology",
    automationGoal: "Chase overdue invoices every Monday",
    ...overrides,
  };
}

describe("onboarding survey ids", () => {
  it("pins the pref key, version and industry list", () => {
    strictEqual(ONBOARDING_SURVEY_PREF_KEY, "houston_onboarding_survey");
    strictEqual(ONBOARDING_SURVEY_VERSION, 2);
    deepStrictEqual(
      [...ONBOARDING_INDUSTRIES],
      [
        "technology",
        "finance",
        "legal",
        "healthcare",
        "education",
        "retail",
        "manufacturing",
        "real_estate",
        "marketing_agencies",
        "government_nonprofit",
        "consulting",
        "something_else",
      ],
    );
  });

  it("accepts only known industry ids", () => {
    strictEqual(isOnboardingIndustry("healthcare"), true);
    strictEqual(isOnboardingIndustry("government_nonprofit"), true);
    strictEqual(isOnboardingIndustry("crypto free text"), false);
    // "skipped" is a persistable CHOICE, never one of the industry answers.
    strictEqual(isOnboardingIndustry(ONBOARDING_INDUSTRY_SKIPPED), false);
    strictEqual(isOnboardingIndustryChoice(ONBOARDING_INDUSTRY_SKIPPED), true);
    strictEqual(isOnboardingIndustryChoice("retail"), true);
    strictEqual(isOnboardingIndustryChoice("crypto free text"), false);
  });

  it("shares one skip sentinel across both questions", () => {
    strictEqual(ONBOARDING_INDUSTRY_SKIPPED, ONBOARDING_SEGMENT_SKIPPED);
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
    // The gateway counts runes; `.length` counts UTF-16 units, so an emoji
    // answer well inside the server's limit used to be refused (and silently
    // dropped from the sync patch) on the client.
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
    // The exact paste a `maxLength` guard used to eat: 2500 emoji is 5000
    // UTF-16 units, the browser cut it to 4000 = EXACTLY the 2000-code-point
    // limit, so it validated clean and 500 of the user's characters vanished
    // with no alert. Nothing clamps the input now, so the over-cap state is
    // what the validator sees, and the screen says so.
    const paste = "🙂".repeat(ONBOARDING_GOAL_MAX_LENGTH + 500);
    strictEqual([...paste].length, ONBOARDING_GOAL_MAX_LENGTH + 500);
    strictEqual(isValidAutomationGoal(paste), false);
    // The truncation a UTF-16 clamp would have produced is indistinguishable
    // from a legitimate answer — which is exactly why it cannot be the guard.
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
      applyIndustry(
        applySegment(
          createOnboardingSurveyPreference(),
          ONBOARDING_SEGMENT_SKIPPED,
        ),
        ONBOARDING_INDUSTRY_SKIPPED,
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
    reject({ segment: "founder_free_text" });
    reject({ segment: undefined });
    reject({ industry: "crypto" });
    reject({ industry: undefined });
    reject({ automationGoal: "" });
    reject({ automationGoal: "x".repeat(ONBOARDING_GOAL_MAX_LENGTH + 1) });
    reject({ automationGoal: 7 });
    reject({ goalSkipped: "yes" });
    reject({ completionPromptDismissed: null });
    reject({ updatedAt: "not a date" });
    reject({ gatewaySyncedAt: "not a date" });
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
        industry: null,
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
      applySegment(synced, "legal"),
      applyIndustry(synced, "finance"),
      applyGoal(synced, "book my travel"),
      applyGoalSkipped(synced),
    ]) {
      strictEqual(next.gatewaySyncedAt, null);
      strictEqual(Number.isNaN(Date.parse(next.updatedAt)), false);
    }
    strictEqual(synced.gatewaySyncedAt, "2026-08-08T10:00:00.000Z");
    strictEqual(synced.segment, "marketing");
  });

  it("keeps a synced record synced when only local UI state changes", () => {
    // Dismissing the completion prompt is this device's UI state, never an
    // answer: clearing the stamp would order a pointless full re-push on the
    // next mount, and restamping `updatedAt` would make an in-flight flush
    // discard its own success. Both must hold.
    const synced = markGatewaySynced(answered(), "2026-08-08T10:00:00.000Z");
    const dismissed = applyCompletionDismissed(synced);
    strictEqual(dismissed.completionPromptDismissed, true);
    strictEqual(dismissed.gatewaySyncedAt, "2026-08-08T10:00:00.000Z");
    strictEqual(dismissed.updatedAt, synced.updatedAt);
    strictEqual(synced.completionPromptDismissed, false);
    // An unsynced record stays unsynced — dismissal invents no sync either.
    strictEqual(applyCompletionDismissed(answered()).gatewaySyncedAt, null);
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

describe("onboarding survey legacy lift", () => {
  it("carries the legacy segment answer into a v2 record", () => {
    const legacy = createOnboardingSegmentPreference("operations");
    deepStrictEqual(liftLegacySegmentPreference(legacy), {
      version: ONBOARDING_SURVEY_VERSION,
      segment: "operations",
      industry: null,
      automationGoal: null,
      goalSkipped: false,
      completionPromptDismissed: false,
      updatedAt: legacy.selectedAt,
      gatewaySyncedAt: null,
    });
  });

  it("carries a legacy skip too, and lifts nothing when there is nothing", () => {
    strictEqual(
      liftLegacySegmentPreference(
        createOnboardingSegmentPreference(ONBOARDING_SEGMENT_SKIPPED),
      )?.segment,
      ONBOARDING_SEGMENT_SKIPPED,
    );
    strictEqual(liftLegacySegmentPreference(null), null);
  });

  it("produces a record its own parser accepts", () => {
    const lifted = liftLegacySegmentPreference(
      createOnboardingSegmentPreference("design"),
    );
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
      ...createOnboardingSegmentPreference("sales"),
      selectedAt: "whenever",
    });
    strictEqual(Number.isNaN(Date.parse(lifted?.updatedAt ?? "")), false);
  });
});

describe("onboarding survey answered semantics", () => {
  it("counts a skip as an answer", () => {
    const skippedAll = applyGoalSkipped(
      applyIndustry(
        applySegment(
          createOnboardingSurveyPreference(),
          ONBOARDING_SEGMENT_SKIPPED,
        ),
        ONBOARDING_INDUSTRY_SKIPPED,
      ),
    );
    strictEqual(isSegmentAnswered(skippedAll), true);
    strictEqual(isIndustryAnswered(skippedAll), true);
    strictEqual(isGoalAnswered(skippedAll), true);
    strictEqual(needsCompletionPrompt(skippedAll), false);
  });

  it("treats a missing record as unanswered", () => {
    strictEqual(isSegmentAnswered(null), false);
    strictEqual(isIndustryAnswered(null), false);
    strictEqual(isGoalAnswered(null), false);
    strictEqual(needsCompletionPrompt(null), false);
  });

  it("prompts only a segmented user with a gap who has not dismissed it", () => {
    const segmentOnly = applySegment(
      createOnboardingSurveyPreference(),
      "product",
    );
    strictEqual(needsCompletionPrompt(segmentOnly), true);
    strictEqual(
      needsCompletionPrompt(applyIndustry(segmentOnly, "education")),
      true, // goal still missing
    );
    strictEqual(
      needsCompletionPrompt(
        applyGoal(applyIndustry(segmentOnly, "education"), "sort my inbox"),
      ),
      false,
    );
    strictEqual(
      needsCompletionPrompt(applyCompletionDismissed(segmentOnly)),
      false,
    );
    // Never prompt someone who has not answered the first question at all.
    strictEqual(
      needsCompletionPrompt(createOnboardingSurveyPreference()),
      false,
    );
  });
});
