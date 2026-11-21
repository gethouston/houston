import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isSurveyQuestion,
  missingSurveySteps,
  ONBOARDING_SURVEY_STEPS,
  surveySourceScreen,
  surveyStepPlan,
  surveyStepViewedEvent,
} from "../src/components/onboarding/survey-steps.ts";
import { AGENT_CONTEXT_IDS } from "../src/lib/agent-role-catalog.ts";
import { LEADERSHIP_ROLE_IDS } from "../src/lib/leadership-roles.ts";
import { ONBOARDING_COMPANY_SIZE_IDS } from "../src/lib/onboarding-company-size.ts";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const answered = (
  industryAnswered: boolean,
  roleAnswered: boolean,
  goalAnswered: boolean,
  companySizeAnswered = true,
) => ({ industryAnswered, roleAnswered, companySizeAnswered, goalAnswered });

describe("survey step plan", () => {
  it("asks the four questions in a fixed order, the industry first", () => {
    assert.deepEqual(
      [...ONBOARDING_SURVEY_STEPS],
      ["industry", "role", "companySize", "goal"],
    );
  });

  it("names its own questions and nothing else", () => {
    assert.equal(isSurveyQuestion("role"), true);
    assert.equal(isSurveyQuestion("segment"), false);
    assert.equal(isSurveyQuestion("teamChoice"), false);
  });

  it("first run walks the whole survey, however much is already answered", () => {
    assert.deepEqual(
      surveyStepPlan("first_run", answered(false, false, false, false)),
      ["industry", "role", "companySize", "goal"],
    );
    assert.deepEqual(surveyStepPlan("first_run", answered(true, true, false)), [
      "industry",
      "role",
      "companySize",
      "goal",
    ]);
  });

  it("the in-app prompt only asks what is missing", () => {
    assert.deepEqual(
      surveyStepPlan("profile_completion", answered(false, true, false)),
      ["industry", "goal"],
    );
    assert.deepEqual(
      surveyStepPlan("profile_completion", answered(true, true, false)),
      ["goal"],
    );
    assert.deepEqual(
      surveyStepPlan("profile_completion", answered(true, true, true)),
      [],
    );
    assert.deepEqual(
      surveyStepPlan("profile_completion", answered(true, true, true, false)),
      ["companySize"],
    );
  });

  it("reports the gaps in ask order for the missing_steps prop", () => {
    assert.equal(
      missingSurveySteps(answered(false, true, false)).join(","),
      "industry,goal",
    );
    assert.equal(
      missingSurveySteps(answered(false, true, false, false)).join(","),
      "industry,companySize,goal",
    );
    assert.equal(missingSurveySteps(answered(true, true, true)).join(","), "");
  });
});

describe("survey analytics vocabulary", () => {
  it("names the first run's source screen after its questions", () => {
    assert.equal(surveySourceScreen("first_run"), "first_run_role");
    assert.equal(
      surveySourceScreen("profile_completion"),
      "profile_completion",
    );
  });

  it("fires one screen_viewed event per question", () => {
    assert.equal(
      surveyStepViewedEvent("industry"),
      "onboarding_industry_screen_viewed",
    );
    assert.equal(
      surveyStepViewedEvent("role"),
      "onboarding_role_screen_viewed",
    );
    assert.equal(
      surveyStepViewedEvent("companySize"),
      "onboarding_company_size_screen_viewed",
    );
    assert.equal(
      surveyStepViewedEvent("goal"),
      "onboarding_goal_screen_viewed",
    );
  });

  it("tracks selection and confirmation as separate events", () => {
    const source = read("../src/components/onboarding/survey-analytics.ts");
    for (const event of [
      "onboarding_industry_selected",
      "onboarding_role_selected",
      "onboarding_industry_continued",
      "onboarding_role_continued",
      "onboarding_company_size_continued",
      "onboarding_goal_continued",
      "onboarding_survey_prompted",
    ]) {
      assert.ok(source.includes(`"${event}"`), `tracks ${event}`);
    }
    assert.doesNotMatch(source, /onboarding_segment_/);
    assert.match(source, /missing_steps: missing\.join\(","\)/);
  });

  it("sends the goal in the user's words only where the person prop reads it", () => {
    const source = read("../src/components/onboarding/survey-analytics.ts");
    assert.match(source, /goalContinued: \(goal: string\)/);
    assert.match(source, /goal_provided: true/);
    assert.match(source, /goal_text: goal/);
  });

  it("confirms an answer only after the save lands", () => {
    const card = read(
      "../src/components/assistant/onboarding/manager-survey-card.tsx",
    );
    assert.match(
      card,
      /await survey\.saveIndustry\(id, other\);\s*track\.industryContinued\(id\);/,
    );
    assert.match(
      card,
      /await survey\.saveRole\(id, other\);\s*track\.roleContinued\(id\);/,
    );
    assert.match(
      card,
      /await survey\.saveCompanySize\(size\);\s*track\.companySizeContinued\(size\);/,
    );
    assert.match(
      card,
      /await survey\.saveGoal\(goal\);\s*track\.goalContinued\(goal\);/,
    );
  });
});

describe("the survey in the manager's chat", () => {
  const about = read(
    "../src/components/assistant/onboarding/manager-about-step.tsx",
  );
  const goal = read(
    "../src/components/assistant/onboarding/manager-goal-card.tsx",
  );
  const size = read(
    "../src/components/assistant/onboarding/manager-company-size-card.tsx",
  );
  const firstRun = read(
    "../src/components/assistant/onboarding/first-run-conversation.tsx",
  );
  const profile = read(
    "../src/components/assistant/onboarding/profile-conversation.tsx",
  );

  it("asks the industry and the role with the create sheet's own steps, addressed to the person", () => {
    assert.match(about, /<ContextStep[^>]*audience="self"/);
    assert.match(about, /<RoleStep[^>]*audience="self"/);
  });

  it("asks the goal in the person's own words, with no way to skip it", () => {
    assert.match(goal, /<Textarea\b/);
    assert.doesNotMatch(goal, /onAnswer\(null\)/);
    assert.doesNotMatch(goal, /goal\.skip/);
    assert.doesNotMatch(goal, /maxLength/);
    assert.match(goal, /onboarding\.goal\.tooLong/);
  });

  it("offers the role question's leadership positions to the person alone", () => {
    assert.match(about, /<RoleStep[^>]*leadership=\{/);
  });

  it("asks the company size with one tap per bucket, on the create sheet's chips", () => {
    assert.match(size, /ONBOARDING_COMPANY_SIZE_IDS\.map/);
    assert.match(size, /<ChoiceChips/);
    assert.match(size, /role="radiogroup"/);
    assert.match(size, /<ManagerStepFrame/);
  });

  it("offers no way out of the first-run survey: the questions are mandatory", () => {
    const mounting = firstRun.slice(firstRun.indexOf("<ManagerSurveyCard"));
    assert.doesNotMatch(mounting.slice(0, mounting.indexOf("/>")), /onDecline/);
  });

  it("keeps 'Not now' on the in-app prompt, remembered once pressed", () => {
    assert.match(profile, /onDecline=\{notNow\}/);
    assert.match(profile, /dismissCompletionPrompt\(\)/);
  });
});

describe("survey locales", () => {
  for (const locale of ["en", "es", "pt"] as const) {
    it(`${locale} translates every question`, () => {
      const setup = JSON.parse(read(`../src/locales/${locale}/setup.json`)) as {
        onboardingSegment?: unknown;
        onboardingSurvey: {
          industry?: unknown;
          goal: { title: string };
          completion: { notNow: string };
        };
      };
      assert.equal(setup.onboardingSegment, undefined);
      assert.equal(setup.onboardingSurvey.industry, undefined);
      assert.ok(setup.onboardingSurvey.goal.title.trim());
      assert.ok(setup.onboardingSurvey.completion.notNow.trim());
      const roleSetup = (
        JSON.parse(read(`../src/locales/${locale}/agent-onboarding.json`)) as {
          roleSetup: {
            contexts: Record<string, string>;
            leadership: string;
            leadershipRoles: Record<string, string>;
            selfContextHeadline: string;
            selfRoleHeadline: string;
          };
        }
      ).roleSetup;
      assert.ok(roleSetup.selfContextHeadline.trim());
      assert.ok(roleSetup.selfRoleHeadline.trim());
      for (const id of AGENT_CONTEXT_IDS) {
        assert.ok(roleSetup.contexts[id]?.trim(), `industry ${id}`);
      }
      assert.ok(roleSetup.leadership.trim());
      for (const id of LEADERSHIP_ROLE_IDS) {
        assert.ok(roleSetup.leadershipRoles[id]?.trim(), `position ${id}`);
      }
      const assistant = JSON.parse(
        read(`../src/locales/${locale}/assistant.json`),
      ) as {
        onboarding: {
          goals?: unknown;
          goal: { placeholder: string; hint: string; skip?: unknown };
          questions: { companySize: string };
          companySize: Record<string, string>;
        };
      };
      assert.equal(assistant.onboarding.goals, undefined);
      assert.ok(assistant.onboarding.goal.placeholder.trim());
      assert.ok(assistant.onboarding.goal.hint.trim());
      assert.equal(assistant.onboarding.goal.skip, undefined);
      assert.ok(assistant.onboarding.questions.companySize.trim());
      for (const id of ONBOARDING_COMPANY_SIZE_IDS) {
        assert.ok(assistant.onboarding.companySize[id]?.trim(), `size ${id}`);
      }
    });
  }
});
