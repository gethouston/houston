import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { renameAgentWithFollowUp } from "../src/lib/rename-agent-follow-up.ts";

describe("renameAgentWithFollowUp", () => {
  it("remaps the sidebar when rename returns a changed id", async () => {
    const remaps: Array<[string, string]> = [];
    await renameAgentWithFollowUp({
      workspaceId: "workspace",
      agentId: "old-id",
      name: "New name",
      renameAgent: async () => ({ id: "new-id" }),
      remapAgentId: (from, to) => remaps.push([from, to]),
    });
    deepStrictEqual(remaps, [["old-id", "new-id"]]);
  });

  it("does not remap when rename preserves the id", async () => {
    let remapCount = 0;
    await renameAgentWithFollowUp({
      workspaceId: "workspace",
      agentId: "same-id",
      name: "New name",
      renameAgent: async () => ({ id: "same-id" }),
      remapAgentId: () => {
        remapCount += 1;
      },
    });
    strictEqual(remapCount, 0);
  });
});
