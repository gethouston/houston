import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { selectCurrentAgent } from "../src/lib/agent-selection.ts";
import type { Agent } from "../src/lib/types.ts";

function agent(id: string, name = id): Agent {
  return {
    id,
    name,
    folderPath: `/agents/${name}`,
    configId: "personal-assistant",
    color: "orange",
    createdAt: "2026-01-01T00:00:00Z",
    lastOpenedAt: "2026-01-01T00:00:00Z",
  };
}

describe("agent selection", () => {
  it("auto-selects the first agent when none is selected", () => {
    const first = agent("a1", "Ada");
    const selected = selectCurrentAgent([first, agent("a2", "Grace")], null);

    strictEqual(selected, first);
  });

  it("keeps the matching loaded agent when the current selection still exists", () => {
    const previous = agent("a2", "Old Grace");
    const refreshed = agent("a2", "Grace");
    const selected = selectCurrentAgent(
      [agent("a1", "Ada"), refreshed],
      previous,
    );

    strictEqual(selected, refreshed);
  });

  it("replaces a stale selection with the first loaded agent", () => {
    const first = agent("a1", "Ada");
    const selected = selectCurrentAgent([first], agent("missing", "Deleted"));

    strictEqual(selected, first);
  });

  it("clears the selection when the workspace has no agents", () => {
    const selected = selectCurrentAgent([], agent("missing", "Deleted"));

    strictEqual(selected, null);
  });
});
