import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("onboarding survey ownership", () => {
  const routes = read("../src/components/shell/app-routes.tsx");
  const routing = read("../src/hooks/use-first-run-routing.ts");
  const card = read(
    "../src/components/assistant/onboarding/manager-survey-card.tsx",
  );

  it("mounts the survey hook exactly once, in App's routing hook", () => {
    assert.equal((routing.match(/useOnboardingSurvey\(\)/g) ?? []).length, 1);
    assert.doesNotMatch(routes, /useOnboardingSurvey\(\)/);
    assert.doesNotMatch(card, /useOnboardingSurvey\(\)/);
    assert.match(card, /survey: OnboardingSurveyState/);
  });
});

describe("first-run lifecycle placement", () => {
  const routes = read("../src/components/shell/app-routes.tsx");
  const host = read(
    "../src/components/assistant/onboarding/manager-onboarding-host.tsx",
  );

  it("runs below the migration gate, so a migrating user never starts a run", () => {
    assert.match(routes, /<CloudMigrationGate>\s*<ManagerOnboardingHost/);
  });

  it("mounts beside the shell, never around it, so the shell is not remounted", () => {
    assert.match(
      host,
      /\{route !== "app" \? \(\s*<FirstRunLifecycle[\s\S]*?\) : null\}\s*\{children\}/,
    );
  });
});

describe("first-run resume contract", () => {
  const hook = read("../src/components/onboarding/use-first-run-onboarding.ts");

  it("starting records the started stage once, on a run not already pending", () => {
    assert.match(
      hook,
      /if \(started\.current\) return;[\s\S]*?startFirstRun\(\{\s*isPending: stage !== "none",[\s\S]*?markPending\("started"\)/,
    );
  });

  it("the team step on screen latches the team stage", () => {
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
