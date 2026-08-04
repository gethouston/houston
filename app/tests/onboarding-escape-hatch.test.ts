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
  const segment = read("../src/components/onboarding/segment-screen.tsx");
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

  it("shows the same escape hatch on the segment screen", () => {
    // The segment screen mounts BEFORE the orchestrator (App-level route), so
    // it carries its own SkipOnboardingButton; App.tsx supplies the terminal
    // handler (analytics + markCompleted — no pending flag exists yet).
    assert.match(segment, /<SkipOnboardingButton onSkip=\{onSkip\} \/>/);
    assert.match(app, /step: "segment",\s*source: "escape_hatch"/);
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
