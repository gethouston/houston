import assert from "node:assert";
import { describe, it } from "node:test";
import { screenPrefetchPlan } from "../src/lib/screen-prefetch-plan.ts";

describe("screenPrefetchPlan", () => {
  it("includes only capability-supported screen reads", () => {
    assert.deepStrictEqual(
      screenPrefetchPlan({ integrations: ["custom"] } as never),
      ["store-catalog"],
    );
    assert.deepStrictEqual(
      screenPrefetchPlan({
        integrations: ["composio"],
        multiplayer: true,
      } as never),
      ["store-catalog", "integrations", "organization"],
    );
  });
});
