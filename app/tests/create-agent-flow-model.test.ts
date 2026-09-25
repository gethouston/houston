import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createFlowIdentity,
  createNameInvalid,
} from "../src/components/shell/create-agent-flow-model.ts";

describe("createFlowIdentity", () => {
  const before = { takenNames: ["Pax"], color: "blue" };
  // The store adopts the new employee before the create settles: its name
  // joins the taken list and its color stops being free.
  const adopted = { takenNames: ["Pax", "Ava"], color: "green" };

  it("holds the identity the hire was submitted with while it is creating", () => {
    deepStrictEqual(
      createFlowIdentity({ live: adopted, submitted: before, creating: true }),
      before,
    );
  });

  it("follows the workspace while nothing is creating", () => {
    deepStrictEqual(
      createFlowIdentity({ live: adopted, submitted: before, creating: false }),
      adopted,
    );
    deepStrictEqual(
      createFlowIdentity({ live: adopted, submitted: null, creating: true }),
      adopted,
    );
  });
});

describe("createNameInvalid", () => {
  it("marks the name for a name issue or a name conflict", () => {
    strictEqual(createNameInvalid("taken", null), true);
    strictEqual(createNameInvalid(null, "nameConflict"), true);
  });

  it("leaves the name alone when the create failed for another reason", () => {
    strictEqual(createNameInvalid(null, "failed"), false);
    strictEqual(createNameInvalid(null, null), false);
  });
});
