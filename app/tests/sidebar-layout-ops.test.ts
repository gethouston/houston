import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston-ai/engine-client";
import { remapAgentIdOp } from "../src/lib/sidebar-layout-ops.ts";

const layout = (over: Partial<SidebarLayout>): SidebarLayout => ({
  groups: [],
  ungroupedOrder: [],
  ...over,
});

describe("remapAgentIdOp", () => {
  it("keeps a grouped agent at its existing position", () => {
    const result = remapAgentIdOp(
      layout({
        groups: [
          {
            id: "group",
            name: "Group",
            collapsed: false,
            agentIds: ["a", "old", "b"],
          },
        ],
      }),
      "old",
      "new",
    );
    deepStrictEqual(result.groups[0]?.agentIds, ["a", "new", "b"]);
  });

  it("keeps an ungrouped agent at its existing position", () => {
    const result = remapAgentIdOp(
      layout({ ungroupedOrder: ["a", "old", "b"] }),
      "old",
      "new",
    );
    deepStrictEqual(result.ungroupedOrder, ["a", "new", "b"]);
  });

  it("leaves an absent id unchanged", () => {
    const initial = layout({ ungroupedOrder: ["a", "new"] });
    strictEqual(remapAgentIdOp(initial, "old", "new"), initial);
  });

  it("removes a duplicate when the new id is already present", () => {
    const result = remapAgentIdOp(
      layout({
        groups: [
          {
            id: "group",
            name: "Group",
            collapsed: false,
            agentIds: ["old", "new"],
          },
        ],
        ungroupedOrder: ["new", "old"],
      }),
      "old",
      "new",
    );
    deepStrictEqual(result.groups[0]?.agentIds, ["new"]);
    deepStrictEqual(result.ungroupedOrder, []);
  });

  it("removes an existing new id from another section", () => {
    const result = remapAgentIdOp(
      layout({
        groups: [
          {
            id: "group",
            name: "Group",
            collapsed: false,
            agentIds: ["old"],
          },
        ],
        ungroupedOrder: ["new"],
      }),
      "old",
      "new",
    );
    deepStrictEqual(result.groups[0]?.agentIds, ["new"]);
    deepStrictEqual(result.ungroupedOrder, []);
  });
});
