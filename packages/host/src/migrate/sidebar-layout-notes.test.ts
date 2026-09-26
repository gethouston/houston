import { describe, expect, it } from "vitest";
import { legacyNotesOf } from "./sidebar-layout-notes";

describe("legacyNotesOf", () => {
  it("maps an agent in two legacy groups to the last group's context, as the old mirror wrote it", () => {
    const notes = legacyNotesOf({
      groups: [
        { id: "g1", name: "One", agentIds: ["a1"], context: "first" },
        { id: "g2", name: "Two", agentIds: ["a1"] },
        { id: "g3", name: "Three", agentIds: ["a1"], context: "last" },
      ],
    });
    expect(notes?.byAgent).toEqual({ a1: "last" });
  });
});
