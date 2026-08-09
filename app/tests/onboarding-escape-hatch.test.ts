import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("onboarding skip escape hatch", () => {
  const onboarding = read(
    "../src/components/onboarding/personal-assistant-onboarding.tsx",
  );
  const button = read(
    "../src/components/onboarding/skip-onboarding-button.tsx",
  );
  const survey = read("../src/components/onboarding/survey-screen.tsx");
  const app = read("../src/App.tsx");

  it("pins a global skip button below the card, from the very first step", () => {
    // No agent gate: a zero-agent skip lands on the shell's empty state,
    // whose "New agent" CTA is the way back (only agent-creating users ever
    // mount onboarding). Only the finished screen hides it — its own CTA exits.
    assert.match(onboarding, /\{step !== "finished" && \(/);
    assert.doesNotMatch(onboarding, /\{agent && step !== "finished"/);
    assert.match(onboarding, /skipOnboarding\(step, "escape_hatch"\)/);
    assert.match(button, /variant="ghost"/);
    assert.match(button, /tutorial\.nav\.skipOnboarding/);
  });

  it("shows the same escape hatch on the first-run survey", () => {
    // The survey mounts BEFORE the orchestrator (App-level route), so it
    // carries its own SkipOnboardingButton; App.tsx supplies the terminal
    // handler (analytics + markCompleted — no pending flag exists yet). Only
    // the first-run mounting gets it; the in-app prompt declines with
    // "Not now" instead, which dismisses the prompt rather than onboarding.
    assert.match(survey, /mode === "first_run" && onDismiss/);
    assert.match(survey, /<SkipOnboardingButton onSkip=\{onDismiss\} \/>/);
    assert.match(app, /step: "segment",\s*source: "escape_hatch"/);
  });

  it("declines the completion prompt along with onboarding", () => {
    // Skipping AFTER answering the job question leaves a segmented record with
    // gaps, which is exactly what the in-app completion prompt fires on: it
    // would re-mount the survey in the same render and make Skip look broken.
    assert.match(
      app,
      /void survey\.dismissCompletionPrompt\(\);\s*void markCompleted\(\);/,
    );
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

  it("routes every skip source through the one terminal teardown", () => {
    // clearPending + markCompleted + setTutorialActive(false) live in the
    // single shared skipOnboarding exit; the email mission uses it too.
    assert.match(onboarding, /skipOnboarding\("emailChat", "conversation"\)/);
    assert.equal((onboarding.match(/void markCompleted\(\)/g) ?? []).length, 2);
  });

  it("translates the label in every locale", () => {
    for (const locale of ["en", "es", "pt"] as const) {
      const setup = JSON.parse(read(`../src/locales/${locale}/setup.json`)) as {
        tutorial: { nav: Record<string, string> };
      };
      const label = setup.tutorial.nav.skipOnboarding;
      assert.ok(label && label.trim().length > 0, `${locale} has a skip label`);
    }
  });
});
