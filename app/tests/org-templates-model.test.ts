import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { canDeleteTemplate } from "../src/components/organization/org-templates-model.ts";

describe("canDeleteTemplate", () => {
  it("lets the owner delete any template", () => {
    strictEqual(
      canDeleteTemplate({
        isOwner: true,
        createdBy: "someone-else",
        currentUserId: "me",
      }),
      true,
    );
  });

  it("lets an admin delete only their own template", () => {
    strictEqual(
      canDeleteTemplate({
        isOwner: false,
        createdBy: "me",
        currentUserId: "me",
      }),
      true,
    );
    strictEqual(
      canDeleteTemplate({
        isOwner: false,
        createdBy: "someone-else",
        currentUserId: "me",
      }),
      false,
    );
  });

  it("hides the affordance when the session isn't loaded", () => {
    strictEqual(
      canDeleteTemplate({
        isOwner: false,
        createdBy: "me",
        currentUserId: null,
      }),
      false,
    );
  });
});
