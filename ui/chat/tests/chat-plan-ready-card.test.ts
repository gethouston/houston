import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  type ChatPlanReadyLabels,
  DEFAULT_PLAN_READY_LABELS,
  resolvePlanReadyActions,
} from "../src/chat-plan-ready-card-model.ts";

const LABELS: ChatPlanReadyLabels = {
  title: "Plan ready",
  startWorking: "Start working",
  runAutopilot: "Run on Autopilot",
  keepPlanning: "Keep planning",
};

describe("resolvePlanReadyActions", () => {
  it("resolves the three actions in render order", () => {
    const actions = resolvePlanReadyActions(LABELS, false);
    assert.deepEqual(
      actions.map((a) => a.key),
      ["startWorking", "runAutopilot", "keepPlanning"],
    );
  });

  it("maps each action to its label and button variant", () => {
    const actions = resolvePlanReadyActions(LABELS, false);
    assert.deepEqual(actions, [
      {
        key: "startWorking",
        label: "Start working",
        variant: "default",
        disabled: false,
      },
      {
        key: "runAutopilot",
        label: "Run on Autopilot",
        variant: "outline",
        disabled: false,
      },
      {
        key: "keepPlanning",
        label: "Keep planning",
        variant: "ghost",
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
    assert.equal(DEFAULT_PLAN_READY_LABELS.startWorking, "Start working");
    assert.equal(DEFAULT_PLAN_READY_LABELS.runAutopilot, "Run on Autopilot");
    assert.equal(DEFAULT_PLAN_READY_LABELS.keepPlanning, "Keep planning");
    for (const value of Object.values(DEFAULT_PLAN_READY_LABELS)) {
      assert.ok(!value.includes("—"), `"${value}" must not use an em dash`);
    }
  });
});
