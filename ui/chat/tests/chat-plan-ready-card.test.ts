import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  type ChatPlanReadyLabels,
  DEFAULT_PLAN_READY_LABELS,
  resolvePlanReadyActions,
} from "../src/chat-plan-ready-card-model.ts";

const LABELS: ChatPlanReadyLabels = {
  title: "Plan ready",
  coworkerTitle: "Continue in Coworker mode",
  coworkerDescription: "Works with you and asks when unsure.",
  autopilotTitle: "Continue in Autopilot mode",
  autopilotDescription: "Finishes it on its own. No questions asked.",
  keepPlanningTitle: "Keep planning",
  keepPlanningDescription: "Stay here and adjust the plan.",
};

describe("resolvePlanReadyActions", () => {
  it("resolves the three actions in render order", () => {
    const actions = resolvePlanReadyActions(LABELS, false);
    assert.deepEqual(
      actions.map((a) => a.key),
      ["startWorking", "runAutopilot", "keepPlanning"],
    );
  });

  it("maps each action to its localized title and description", () => {
    const actions = resolvePlanReadyActions(LABELS, false);
    assert.deepEqual(actions, [
      {
        key: "startWorking",
        title: "Continue in Coworker mode",
        description: "Works with you and asks when unsure.",
        disabled: false,
      },
      {
        key: "runAutopilot",
        title: "Continue in Autopilot mode",
        description: "Finishes it on its own. No questions asked.",
        disabled: false,
      },
      {
        key: "keepPlanning",
        title: "Keep planning",
        description: "Stay here and adjust the plan.",
        disabled: false,
      },
    ]);
  });

  it("gates every action uniformly when disabled", () => {
    const actions = resolvePlanReadyActions(LABELS, true);
    assert.ok(actions.every((a) => a.disabled));
  });

  it("leaves every action enabled when not disabled", () => {
    const actions = resolvePlanReadyActions(LABELS, false);
    assert.ok(actions.every((a) => !a.disabled));
  });
});

describe("DEFAULT_PLAN_READY_LABELS", () => {
  it("ships the English fallback copy with no em dashes", () => {
    assert.equal(DEFAULT_PLAN_READY_LABELS.title, "Plan ready");
    assert.equal(
      DEFAULT_PLAN_READY_LABELS.coworkerTitle,
      "Continue in Coworker mode",
    );
    assert.equal(
      DEFAULT_PLAN_READY_LABELS.autopilotTitle,
      "Continue in Autopilot mode",
    );
    assert.equal(DEFAULT_PLAN_READY_LABELS.keepPlanningTitle, "Keep planning");
    for (const value of Object.values(DEFAULT_PLAN_READY_LABELS)) {
      assert.ok(!value.includes("—"), `"${value}" must not use an em dash`);
    }
  });
});
