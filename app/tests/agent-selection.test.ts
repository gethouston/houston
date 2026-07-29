import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  selectCurrentAgent,
  selectLoadedAgent,
  shouldApplyAgentLoad,
} from "../src/lib/agent-selection.ts";
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

  it("uses the refreshed record for a selection made while a roster read is in flight", () => {
    const ada = agent("ada");
    const oldGrace = agent("grace", "Old Grace");
    const refreshedGrace = agent("grace", "Grace");

    strictEqual(
      selectLoadedAgent([ada, refreshedGrace], oldGrace, ada.id),
      refreshedGrace,
    );
  });

  it("keeps a mid-flight selection missing from this stale roster", () => {
    const ada = agent("ada");
    const grace = agent("grace");

    strictEqual(selectLoadedAgent([ada], grace, ada.id), grace);
  });

  it("falls back when the unchanged selection was removed", () => {
    const ada = agent("ada");

    strictEqual(selectLoadedAgent([ada], agent("grace"), "grace"), ada);
  });

  it("rejects an older response after a newer roster load starts", () => {
    deepStrictEqual(
      [shouldApplyAgentLoad(1, 2), shouldApplyAgentLoad(2, 2)],
      [false, true],
    );
  });
});
