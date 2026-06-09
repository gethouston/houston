import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { groupIdsByAgent } from "../src/components/board/group-ids-by-agent.ts";

describe("groupIdsByAgent", () => {
  // activityId -> agentPath lookup, mirroring Mission Control's pathMap.
  const owner: Record<string, string> = {
    a1: "/agents/alice",
    a2: "/agents/alice",
    b1: "/agents/bob",
  };
  const lookup = (id: string) => owner[id];

  it("buckets ids by their owning agent path", () => {
    deepStrictEqual(groupIdsByAgent(["a1", "b1", "a2"], lookup), {
      "/agents/alice": ["a1", "a2"],
      "/agents/bob": ["b1"],
    });
  });

  it("drops ids whose agent can't be resolved", () => {
    // A card that fell out of the cross-agent view between selection and
    // dispatch must be skipped, never misrouted to another agent.
    deepStrictEqual(groupIdsByAgent(["a1", "ghost"], lookup), {
      "/agents/alice": ["a1"],
    });
  });

  it("returns an empty object for an empty selection", () => {
    deepStrictEqual(groupIdsByAgent([], lookup), {});
  });

  it("preserves id order within each agent bucket", () => {
    deepStrictEqual(groupIdsByAgent(["a2", "a1"], lookup), {
      "/agents/alice": ["a2", "a1"],
    });
  });
});
