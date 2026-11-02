import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { planInvalidation } from "../src/lib/agent-invalidation-plan.ts";

describe("next-step suggestions reactivity", () => {
  it("PreferencesChanged refreshes the account preference rows whatever space is open", () => {
    const plan = planInvalidation(
      { type: "PreferencesChanged", data: { workspace_id: "Personal" } },
      { workspaceId: "another" },
    );
    deepStrictEqual(plan.invalidate, [["preferences"]]);
    deepStrictEqual(plan.patchAllConversations, []);
  });
});
