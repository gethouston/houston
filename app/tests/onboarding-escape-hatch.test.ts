import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("onboarding survey escape hatch", () => {
  const survey = read("../src/components/onboarding/survey-screen.tsx");
  const app = read("../src/App.tsx");

  it("offers NO escape hatch on the first-run survey — the questions are mandatory", () => {
    // The three questions are deliberately unskippable (Julian, Aug 2026):
    // the dismiss affordance is wired only in the FRAMED (profile_completion)
    // mode, and the first-run mounting passes no dismiss handler. The in-app
    // completion prompt keeps its "Not now" — that dismisses the PROMPT, not
    // the setup.
    assert.match(
      survey,
      /onDismiss=\{framed \? \(onDismiss \?\? null\) : null\}/,
    );
    assert.doesNotMatch(app, /mode="first_run"[\s\S]{0,200}?onDismiss/);
  });

  it("mounts the survey hook exactly once, at App level", () => {
    // `useOnboardingSurvey` runs the record's catch-up flush per instance, so
    // a second live instance inside the screen would double every recovery
    // PUT. App owns it and passes the state down.
    const flow = read("../src/components/onboarding/use-survey-flow.ts");
    assert.doesNotMatch(flow, /useOnboardingSurvey\(\)/);
    assert.match(flow, /survey: OnboardingSurveyState/);
    assert.equal((app.match(/useOnboardingSurvey\(\)/g) ?? []).length, 1);
  });
});

describe("in-app setup resume contract", () => {
  it("first-run arming stamps onboarding_pending; every finish clears it", () => {
    // Creating the agent flips the zero-agent first-run signal, so the
    // durable pending flag is the ONLY thing that resumes a quit-mid-setup
    // user (App.tsx routes `onboardingPending` back to "onboarding").
    const overlay = read("../src/components/onboarding/in-app-onboarding.tsx");
    const hook = read("../src/components/onboarding/use-in-app-onboarding.ts");
    assert.match(
      overlay,
      /setFirstRun\(true\);\s*setActive\(true\);\s*void markPending\(\)/,
    );
    assert.match(
      hook,
      /void clearPending\(\);\s*void markCompleted\(\);\s*setActive\(false\)/,
    );
    // An ASKED-FOR run is NOT a first run: it never marks pending. One
    // composition serves every control that offers the guided setup (the
    // rail's help menu, the Academy's setup chapter).
    const guided = read("../src/hooks/use-run-guided-setup.ts");
    assert.match(guided, /setInAppOnboardingFirstRun\(false\)/);
    assert.doesNotMatch(guided, /markPending/);
  });
});
