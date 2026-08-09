import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
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
        agentStartedLabel: "Started by agent",
      }),
      ["Started by agent"],
    );
  });

  it("routine tags outrank the agent-started tag", () => {
    deepStrictEqual(
      missionCardTags({
        routineId: "routine-id",
        routineLabel: "Routine",
        originSessionKey: "conv-parent",
        agentStartedLabel: "Started by agent",
      }),
      ["Routine"],
    );
  });
});
