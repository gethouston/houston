import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { missionCardTags } from "../src/lib/mission-card.ts";

const modes = [
  { id: "default", name: "Default" },
  { id: "research", name: "Research" },
];

describe("missionCardTags", () => {
  it("uses the agent mode label when the mission has a mode", () => {
    deepStrictEqual(
      missionCardTags({
        agent: "research",
        agentModes: modes,
        routineLabel: "Routine",
      }),
      ["Research"],
    );
  });

  it("uses the routine label when the mission is a routine chat with no mode", () => {
    deepStrictEqual(
      missionCardTags({
        routineId: "routine-id",
        agentModes: modes,
        routineLabel: "Routine",
      }),
      ["Routine"],
    );
  });

  it("keeps normal blank missions untagged", () => {
    strictEqual(
      missionCardTags({
        agentModes: modes,
        routineLabel: "Routine",
      }),
      undefined,
    );
  });

  it("tags an agent-started mission (PRODUCT-1244)", () => {
    deepStrictEqual(
      missionCardTags({
        agentModes: modes,
        routineLabel: "Routine",
        originSessionKey: "conv-parent",
        agentStartedLabel: "Started by agent",
      }),
      ["Started by agent"],
    );
  });

  it("mode and routine tags outrank the agent-started tag", () => {
    deepStrictEqual(
      missionCardTags({
        agent: "research",
        agentModes: modes,
        routineLabel: "Routine",
        originSessionKey: "conv-parent",
        agentStartedLabel: "Started by agent",
      }),
      ["Research"],
    );
    deepStrictEqual(
      missionCardTags({
        routineId: "routine-id",
        agentModes: modes,
        routineLabel: "Routine",
        originSessionKey: "conv-parent",
        agentStartedLabel: "Started by agent",
      }),
      ["Routine"],
    );
  });
});
