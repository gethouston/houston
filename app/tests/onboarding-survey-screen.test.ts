import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  missingSurveySteps,
  ONBOARDING_SURVEY_STEPS,
  surveySourceScreen,
  surveyStepPlan,
  surveyStepViewedEvent,
} from "../src/components/onboarding/survey-steps.ts";
import {
  ONBOARDING_INDUSTRIES,
  ONBOARDING_SEGMENTS,
} from "../src/lib/onboarding-survey.ts";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const answered = (
  segmentAnswered: boolean,
  industryAnswered: boolean,
  goalAnswered: boolean,
) => ({ segmentAnswered, industryAnswered, goalAnswered });

describe("survey step plan", () => {
  it("asks the three questions in a fixed order", () => {
    assert.deepEqual(
      [...ONBOARDING_SURVEY_STEPS],
      ["segment", "industry", "goal"],
    );
  });

  it("first run walks the whole survey, however much is already answered", () => {
    // The intro is the moment we get the user's full attention; a resumed
    // first run keeps its earlier answers preselected rather than skipping.
    assert.deepEqual(
      surveyStepPlan("first_run", answered(false, false, false)),
      ["segment", "industry", "goal"],
    );
    assert.deepEqual(surveyStepPlan("first_run", answered(true, true, false)), [
      "segment",
      "industry",
      "goal",
    ]);
  });

  it("the in-app prompt only asks what is missing", () => {
    assert.deepEqual(
      surveyStepPlan("profile_completion", answered(true, false, false)),
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
  });

  it("reports the gaps in ask order for the missing_steps prop", () => {
    assert.equal(
      missingSurveySteps(answered(true, false, false)).join(","),
      "industry,goal",
    );
    assert.equal(missingSurveySteps(answered(true, true, true)).join(","), "");
  });
});

describe("survey analytics vocabulary", () => {
  it("keeps the first-run funnel on its original source screen", () => {
    // Renaming it would split the existing segmentation funnel in two.
    assert.equal(surveySourceScreen("first_run"), "first_run_segment");
    assert.equal(
      surveySourceScreen("profile_completion"),
      "profile_completion",
    );
  });

  it("fires one screen_viewed event per question", () => {
    assert.equal(
      surveyStepViewedEvent("segment"),
      "onboarding_segment_screen_viewed",
    );
    assert.equal(
      surveyStepViewedEvent("industry"),
      "onboarding_industry_screen_viewed",
    );
    assert.equal(
      surveyStepViewedEvent("goal"),
      "onboarding_goal_screen_viewed",
    );
  });

  it("tracks selection and confirmation as separate events", () => {
    // `*_selected` is the exploratory click, `*_continued` the saved answer
    // that carries the person property. Collapsing them would inflate the
    // stored segment/industry with whatever the user hovered over last.
    const source = read("../src/components/onboarding/survey-analytics.ts");
    for (const event of [
      "onboarding_segment_selected",
      "onboarding_industry_selected",
      "onboarding_segment_continued",
      "onboarding_industry_continued",
      "onboarding_goal_continued",
      "onboarding_survey_prompted",
    ]) {
      assert.ok(source.includes(`"${event}"`), `tracks ${event}`);
    }
    assert.match(source, /missing_steps: missing\.join\(","\)/);
  });

  it("sends the goal in the user's words only where the person prop reads it", () => {
    // `goal_text` is stripped from the event payload by `track` (events stay
    // content-free) and survives only as the truncated person property, so a
    // skipped goal must send no text at all.
    const source = read("../src/components/onboarding/survey-analytics.ts");
    assert.match(source, /goal_provided: goal !== null/);
    assert.match(source, /goal === null \? \{\} : \{ goal_text: goal \}/);
  });

  it("confirms an answer only after the save lands", () => {
    const flow = read("../src/components/onboarding/use-survey-flow.ts");
    assert.match(flow, /await persist\(\);\s*confirmed\(\);\s*setIndex/);
  });
});

describe("survey screen wiring", () => {
  const screen = read("../src/components/onboarding/survey-screen.tsx");
  const answer = read("../src/components/onboarding/survey-answer.tsx");
  const grid = read("../src/components/onboarding/survey-pill-grid.tsx");
  const footer = read("../src/components/onboarding/survey-footer.tsx");

  it("keeps the segmentation screen's pill presentation", () => {
    assert.match(
      grid,
      /grid w-full max-w-xl grid-cols-2 gap-2\.5 md:grid-cols-3/,
    );
    assert.match(grid, /aria-pressed=\{selected\}/);
  });

  it("never clamps the goal field, and validates it exactly", () => {
    // `maxLength` counts UTF-16 units and the record counts code points, so
    // ANY clamp near the limit silently eats the tail of an over-cap emoji
    // paste and hands back something that then validates clean. The code-point
    // rule is the only authority; over-cap text stays on screen and says so.
    const flow = read("../src/components/onboarding/use-survey-flow.ts");
    assert.doesNotMatch(answer, /maxLength=/);
    assert.match(flow, /const goalValid = isValidAutomationGoal\(goal\)/);
    assert.match(flow, /canContinue:[\s\S]*?: goalValid,/);
    assert.match(screen, /flow\.goalTooLong[\s\S]*?goal\.tooLong/);
  });

  it("associates the VALIDATION problem with the field it belongs to", () => {
    // A bare `role="alert"` paragraph is announced once and then orphaned; the
    // field itself must report that it is invalid and name the reason.
    assert.match(answer, /aria-invalid=\{errorId !== null\}/);
    assert.match(answer, /aria-describedby=\{errorId \?\? undefined\}/);
    assert.match(screen, /errorId=\{invalid \? PROBLEM_ID : null\}/);
    assert.match(screen, /<p\s+id=\{PROBLEM_ID\}[\s\S]*?role="alert"/);
  });

  it("never marks the field invalid because a SAVE failed", () => {
    // A network failure is not a problem with the answer: folding it into the
    // validation slot told a screen-reader user to fix text that is perfectly
    // fine. It gets its own alert, linked to nothing.
    assert.match(
      screen,
      /const invalid = flow\.goalTooLong[\s\S]*?onboardingSurvey\.goal\.tooLong/,
    );
    assert.match(
      screen,
      /\{flow\.error && \(\s*<p className="text-xs text-danger" role="alert">/,
    );
    assert.doesNotMatch(screen, /errorId=\{[^}]*flow\.error/);
    // …and editing the answer clears the stale failure, so the two never stack.
    const flow = read("../src/components/onboarding/use-survey-flow.ts");
    assert.match(
      flow,
      /writeGoal: \(value\) => \{\s*setGoal\(value\);\s*setError\(null\);/,
    );
  });

  it("disables Continue until the step is valid", () => {
    assert.match(footer, /disabled=\{!canContinue \|\| saving\}/);
  });

  it("renders no first-run escape hatch — the questions are mandatory", () => {
    // The dismiss affordance is wired only in the FRAMED (profile_completion)
    // mode; a first-run mounting passes none, so the screen has no way out.
    assert.match(
      screen,
      /onDismiss=\{framed \? \(onDismiss \?\? null\) : null\}/,
    );
  });

  it("offers no per-question skip on the goal step", () => {
    // A link one reflex click from the answer we were asking for got taken
    // without a decision. The deliberate exit is "Not now" on the completion
    // prompt; the goal step's only way forward is a valid answer.
    const flow = read("../src/components/onboarding/use-survey-flow.ts");
    assert.doesNotMatch(footer, /onSkipQuestion|goal\.skip/);
    assert.doesNotMatch(screen, /onSkipQuestion|skipGoal/);
    assert.doesNotMatch(flow, /skipGoal/);
    // …and the only decline still rendered under Continue is "Not now".
    assert.match(footer, /completion\.notNow/);
  });
});

describe("survey locales", () => {
  for (const locale of ["en", "es", "pt"] as const) {
    it(`${locale} translates every question and option`, () => {
      const setup = JSON.parse(read(`../src/locales/${locale}/setup.json`)) as {
        onboardingSegment: { options: Record<string, string> };
        onboardingSurvey: {
          industry: {
            title: string;
            subtitle: string;
            options: Record<string, string>;
          };
          goal: {
            title: string;
            subtitle: string;
            placeholder: string;
            skip?: string;
          };
          completion: { title: string; subtitle: string; notNow: string };
          progress: { label: string };
        };
      };
      for (const id of ONBOARDING_SEGMENTS) {
        assert.ok(setup.onboardingSegment.options[id]?.trim(), `job ${id}`);
      }
      for (const id of ONBOARDING_INDUSTRIES) {
        assert.ok(
          setup.onboardingSurvey.industry.options[id]?.trim(),
          `industry ${id}`,
        );
      }
      // The per-question skip is gone from the UI, so its copy must go too:
      // a stranded key is the next contributor's invitation to re-add the link.
      assert.equal(setup.onboardingSurvey.goal.skip, undefined);
      assert.ok(setup.onboardingSurvey.goal.placeholder.trim());
      assert.ok(setup.onboardingSurvey.completion.notNow.trim());
      assert.match(setup.onboardingSurvey.progress.label, /\{\{current\}\}/);
      assert.match(setup.onboardingSurvey.progress.label, /\{\{total\}\}/);
    });
  }
});
