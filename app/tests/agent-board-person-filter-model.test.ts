import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { reconcileBoardFilterUserId } from "../src/components/board/agent-board-person-filter-model.ts";

// The board tab is keyed by tab, not agent, so the person-filter hook instance
// is reused across agent switches. These pin the reconcile contract that keeps
// a teammate chosen for agent A from bleeding into agent B's board.

describe("reconcileBoardFilterUserId — reset on agent switch", () => {
  it("keeps the selected person while the agent (path) is unchanged", () => {
    // Text search, re-renders, and data refreshes re-run this each frame; none
    // may drop the user's chosen person.
    strictEqual(
      reconcileBoardFilterUserId({
        trackedPath: "/ws/AgentA",
        path: "/ws/AgentA",
        filterUserId: "mate",
      }),
      "mate",
    );
  });

  it("keeps Everyone (null) unchanged on the same agent", () => {
    strictEqual(
      reconcileBoardFilterUserId({
        trackedPath: "/ws/AgentA",
        path: "/ws/AgentA",
        filterUserId: null,
      }),
      null,
    );
  });

  it("resets to Everyone (null) when the agent changes, dropping the stale person", () => {
    // The leak: filtering agent A by teammate X then switching to agent B must
    // NOT carry X over (B's board would filter by someone off its roster and
    // render empty). Reconcile clears the selection on the path change.
    strictEqual(
      reconcileBoardFilterUserId({
        trackedPath: "/ws/AgentA",
        path: "/ws/AgentB",
        filterUserId: "mate",
      }),
      null,
    );
  });

  it("is a no-op reset when nothing was selected on the previous agent", () => {
    strictEqual(
      reconcileBoardFilterUserId({
        trackedPath: "/ws/AgentA",
        path: "/ws/AgentB",
        filterUserId: null,
      }),
      null,
    );
  });
});
