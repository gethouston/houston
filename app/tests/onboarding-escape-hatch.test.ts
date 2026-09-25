import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("onboarding survey escape hatch", () => {
  const survey = read("../src/components/onboarding/survey-screen.tsx");
  const routes = read("../src/components/shell/app-routes.tsx");
  const routing = read("../src/hooks/use-first-run-routing.ts");

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
    assert.doesNotMatch(routes, /mode="first_run"[\s\S]{0,200}?onDismiss/);
  });

  it("mounts the survey hook exactly once, in App's routing hook", () => {
    // `useOnboardingSurvey` runs the record's catch-up flush per instance, so
    // a second live instance inside the screen would double every recovery
    // PUT. App's routing hook owns it and App passes the state down.
    const flow = read("../src/components/onboarding/use-survey-flow.ts");
    assert.doesNotMatch(flow, /useOnboardingSurvey\(\)/);
    assert.match(flow, /survey: OnboardingSurveyState/);
    assert.equal((routing.match(/useOnboardingSurvey\(\)/g) ?? []).length, 1);
    assert.doesNotMatch(routes, /useOnboardingSurvey\(\)/);
  });
});

describe("first-run resume contract", () => {
  const hook = read("../src/components/onboarding/use-first-run-onboarding.ts");

  it("starting records the started stage once, on a run not already pending", () => {
    // Hiring the first AI Employee flips the zero-agent first-run signal, so
    // the durable pending stage is the ONLY thing that resumes a user who quit
    // mid-onboarding (`useFirstRunRouting` routes it back in). What a start
    // does on a fresh or resumed mount is `startFirstRun`'s contract
    // (`first-run-start.test.ts`); a stale in-app tutorial flag never mounts
    // the onboarding at all (`onboarding-route.test.ts`).
    assert.match(
      hook,
      /if \(started\.current\) return;[\s\S]*?startFirstRun\(\{\s*isPending: stage !== "none",[\s\S]*?markPending\("started"\)/,
    );
  });

  it("the team card on screen latches the team stage", () => {
    assert.match(
      hook,
      /shown !== "team" \|\| stage === "team"[\s\S]*?markPending\("team"\)/,
    );
  });

  it("the finish clears the stage and stamps completed", () => {
    assert.match(
      hook,
      /finished\.current = true;[\s\S]*?clearPending\(\)[\s\S]*?markCompleted\(\)/,
    );
  });
});
