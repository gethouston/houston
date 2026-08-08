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

  it("treats a null routine id as no routine", () => {
    strictEqual(
      missionCardTags({ routineId: null, routineLabel: "Routine" }),
      undefined,
    );
  });
});
