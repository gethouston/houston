import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { summarizeAgentAccess } from "../src/components/organization/org-agents-model.ts";

describe("org agents model", () => {
  it("reads managers + count from the rich assignments list", () => {
    deepStrictEqual(
      summarizeAgentAccess({
        assignments: [
          { userId: "u1", access: "manager" },
          { userId: "u2", access: "user" },
        ],
      }),
      { managerIds: ["u1"], everyone: false, peopleCount: 2 },
    );
  });

  it("empty assignee set means everyone in the org", () => {
    deepStrictEqual(summarizeAgentAccess({ assignments: [] }), {
      managerIds: [],
      everyone: true,
      peopleCount: 0,
    });
  });

  it("falls back to assignedUserIds when assignments are absent (no manager info)", () => {
    deepStrictEqual(summarizeAgentAccess({ assignedUserIds: ["a", "b"] }), {
      managerIds: [],
      everyone: false,
      peopleCount: 2,
    });
  });

  it("neither field present → count unknown", () => {
    deepStrictEqual(summarizeAgentAccess({}), {
      managerIds: [],
      everyone: false,
      peopleCount: null,
    });
  });
});
