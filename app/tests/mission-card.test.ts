import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { AGENT_SETUP_AGENT_MODE } from "../src/lib/agent-setup-mode.ts";
import { missionCardTags } from "../src/lib/mission-card.ts";

describe("missionCardTags", () => {
  it("tags a routine-born mission with the routine label", () => {
    deepStrictEqual(
      missionCardTags({
        routineId: "routine-id",
        routineLabel: "Routine",
      }),
      ["Routine"],
    );
  });

  it("keeps normal missions untagged", () => {
    strictEqual(missionCardTags({ routineLabel: "Routine" }), undefined);
  });

  it("tags an agent-started mission (PRODUCT-1244)", () => {
    deepStrictEqual(
      missionCardTags({
        routineLabel: "Routine",
        originSessionKey: "conv-parent",
        agentStartedLabel: "Started by AI Employee",
      }),
      ["Started by AI Employee"],
    );
  });

  it("tags the agent's self-setup mission", () => {
    deepStrictEqual(
      missionCardTags({
        routineLabel: "Routine",
        agentMode: AGENT_SETUP_AGENT_MODE,
        setupLabel: "Set up",
      }),
      ["Set up"],
    );
  });

  it("leaves other agent modes untagged", () => {
    strictEqual(
      missionCardTags({
        routineLabel: "Routine",
        agentMode: "houston:routine-setup",
        setupLabel: "Set up",
      }),
      undefined,
    );
  });

  it("the setup tag outranks the agent-started tag", () => {
    // The setup mission is Houston's own, not one the agent chose to start.
    deepStrictEqual(
      missionCardTags({
        routineLabel: "Routine",
        agentMode: AGENT_SETUP_AGENT_MODE,
        setupLabel: "Set up",
        originSessionKey: "conv-parent",
        agentStartedLabel: "Started by AI Employee",
      }),
      ["Set up"],
    );
  });

  it("routine tags outrank the agent-started tag", () => {
    deepStrictEqual(
      missionCardTags({
        routineId: "routine-id",
        routineLabel: "Routine",
        originSessionKey: "conv-parent",
        agentStartedLabel: "Started by AI Employee",
      }),
      ["Routine"],
    );
  });
});
