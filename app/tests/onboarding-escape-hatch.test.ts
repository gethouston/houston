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

  it("pins a global skip button below the card, gated on a provisioned assistant", () => {
    // Gate matters: `markCompleted` is permanent, so a skip before the
    // assistant exists would strand the user in an empty shell forever.
    assert.match(onboarding, /\{agent && step !== "finished" && \(/);
    assert.match(onboarding, /skipOnboarding\(step, "escape_hatch"\)/);
    assert.match(button, /variant="ghost"/);
    assert.match(button, /tutorial\.nav\.skipOnboarding/);
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
