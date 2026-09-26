import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import enOnboarding from "../src/locales/en/agent-onboarding.json" with {
  type: "json",
};
import enShell from "../src/locales/en/shell.json" with { type: "json" };
import esOnboarding from "../src/locales/es/agent-onboarding.json" with {
  type: "json",
};
import esShell from "../src/locales/es/shell.json" with { type: "json" };
import ptOnboarding from "../src/locales/pt/agent-onboarding.json" with {
  type: "json",
};
import ptShell from "../src/locales/pt/shell.json" with { type: "json" };

/**
 * The create-agent flow's non-pure seams: the wiring that no render test and
 * no Playwright spec can observe.
 *
 * What the user can see is guarded where it is visible: the shared choice row
 * in `ui/core/tests/flow-choice-row.test.ts`, the typed answer on both
 * breakpoints in `packages/web/e2e/agent-onboarding.spec.ts` and
 * `packages/web/e2e/mobile/create-agent-brief.spec.ts`, the frame's recipe in
 * `dialog-recipes-flow.test.ts`, each question's model in
 * `choice-step-model.test.ts` / `role-step-model.test.ts`. What is left here is
 * the wiring between them — which component a screen composes, which reach its
 * filter is judged by, the field caps, the failure path's reporting, the one
 * way back, and the copy shipped in all three locales. None of those modules
 * loads under this suite's `--experimental-strip-types` runner (React, the
 * Zustand stores and the i18n barrel all come with them).
 */
function source(path: string): string {
  return readFileSync(join(import.meta.dirname, "../src", path), "utf8");
}

describe("both choice screens are composed from the ONE choice recipe", () => {
  const choose = source("components/shell/choose-start-step.tsx");
  const add = source("components/shell/add-choice-step.tsx");
  const screens = [
    ["the opening choice", add],
    ["the hire/copy choice", choose],
  ] as const;

  it("lays two rows out in the shared list, on both screens", () => {
    // `FlowChoiceRow` in a `FlowChoiceList` is the shared choice grammar
    // (@houston-ai/core), so no screen invents a tile of its own.
    for (const [name, screen] of screens) {
      assert.equal(
        screen.match(/<FlowChoiceRow/g)?.length,
        2,
        `${name} must offer exactly two rows`,
      );
      assert.ok(
        screen.includes("<FlowChoiceList>"),
        `${name} must lay them out with the shared list`,
      );
    }
  });

  it("wears the product's own mark for an AI employee, on both screens", () => {
    for (const [name, screen] of screens) {
      assert.ok(
        screen.includes('<HoustonHelmet color="currentColor" />'),
        `${name}: an agent is a Houston, not a generic robot glyph`,
      );
    }
  });
});

describe("each question's filter is judged by the catalog it reaches", () => {
  // `ChoiceStep` shows the filter past `SEARCH_THRESHOLD` reachable options, so
  // a step passing the runs ON SCREEN would drop its own field mid-query.
  it("hands the role question the whole catalog to reach", () => {
    const role = source("components/shell/role-step.tsx");
    assert.ok(role.includes("reach: ROLE_SEARCH_REACH"));
    // An industry the user typed has no run of its own, so the headline says
    // out loud that typing finds any job.
    assert.ok(role.includes("roleSetup.typeToFindAnyRole"));
  });

  it("hands the industry question every industry to reach", () => {
    assert.ok(
      source("components/shell/context-step.tsx").includes(
        "reach: CONTEXT_SEARCH_REACH",
      ),
    );
  });
});

describe("a typed answer is capped in the field, not only on the way out", () => {
  it("clamps BOTH fields of the row to the brief's own cap", () => {
    // The filter's query becomes the answer ("use what you typed"), so a paste
    // must stop at whichever of the two the user is standing in.
    const row = source("components/shell/choice-row.tsx");
    assert.equal(
      row.match(/maxLength=\{AGENT_ROLE_PART_MAX_LENGTH\}/g)?.length,
      2,
    );
  });

  it("caps every write into the state, whichever field seeded it", () => {
    // `capRolePart` is the cap itself (`agent-role-context.test.ts`); this
    // guards that BOTH answers are written through it, so the seeded path
    // cannot route around the fields' own `maxLength`.
    const state = source("components/shell/use-agent-role-state.ts");
    assert.ok(state.includes("setCustomContext(capRolePart(value))"));
    assert.ok(state.includes("setCustomRole(capRolePart(value))"));
  });
});

describe("a create is reported and lands at the top level", () => {
  const hook = source("components/shell/use-create-blank-agent.ts");
  const create = source("lib/create-employee.ts");
  const pin = source("hooks/use-kickoff-pin-resolver.ts");

  it("never logs a failure away", () => {
    for (const src of [hook, create]) {
      assert.ok(
        !src.includes("logger.error"),
        "a log-only catch reaches no reporting path",
      );
    }
  });

  it("leaves a new agent at the top level", () => {
    assert.ok(!hook.includes("targetTeamId"));
    assert.ok(!create.includes("moveItem("));
    assert.ok(!create.includes("teamId"));
  });

  it("catches the last-used lookup rather than floating the promise", () => {
    assert.ok(hook.includes("useKickoffPinResolver(open)"));
    assert.ok(/getLastUsed\(\)[\s\S]{0,600}\.catch\(/.test(pin));
  });
});

describe("the guided setup goes back the way everything else does", () => {
  it("rewinds from the sheet's own header slot, never a screen's own arrow", () => {
    // ONE way back for the whole flow, in the one place it never moves.
    for (const path of [
      "components/shell/naming-step.tsx",
      "components/shell/customize-step.tsx",
      "components/copy-agent/copy-agent-wizard.tsx",
    ]) {
      const screen = source(path);
      assert.ok(!screen.includes("BackControl"), `${path}: a second way back`);
      assert.ok(!screen.includes("ArrowLeft"), `${path}: a second way back`);
      assert.ok(!screen.includes("onBack"), `${path} still rewinds itself`);
    }
  });
});

describe("the flow's copy ships in all three locales", () => {
  it("names both doors of the opening choice", () => {
    for (const [locale, shell] of [
      ["en", enShell],
      ["es", esShell],
      ["pt", ptShell],
    ] as const) {
      for (const key of ["chooseHeadline", "hireTitle", "copyTitle"] as const) {
        const value: string = shell.newAgent[key];
        assert.ok(value.length > 0, `${locale}: newAgent.${key} is empty`);
      }
    }
  });

  it("leaves the industry question with no copy link of its own", () => {
    // Hiring or copying is answered on the first screen; a second door under
    // the industry chips would ask the same question twice.
    for (const [locale, copy] of [
      ["en", enOnboarding],
      ["es", esOnboarding],
      ["pt", ptOnboarding],
    ] as const) {
      assert.ok(
        !Object.hasOwn(copy.roleSetup, "copyExisting"),
        `${locale}: the retired copy-link key is still shipped`,
      );
    }
  });
});

describe("a new hire waits for the user to start its first day", () => {
  it("no create door starts the setup task on its own", () => {
    for (const path of [
      "components/shell/use-create-blank-agent.ts",
      "lib/create-employee.ts",
      "components/portable/import-install.ts",
      "components/agent-actions/use-copy-agent.ts",
    ]) {
      assert.ok(
        !source(path).includes("startFirstDay"),
        `${path} starts the first day without the user`,
      );
    }
  });

  it("hires and imports are born pending in their create, and a copy never", () => {
    assert.ok(
      source("lib/create-employee.ts").includes(
        '{ ...input.pin, firstDay: "pending", arrival: "created" }',
      ),
    );
    assert.ok(
      source("components/portable/import-install.ts").includes(
        'config: { ...kickoffPin, firstDay: "pending", arrival: "imported" }',
      ),
    );
    assert.ok(
      !source("components/agent-actions/use-copy-agent.ts").includes(
        "firstDay",
      ),
    );
  });
});
