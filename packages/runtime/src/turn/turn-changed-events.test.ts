import { describe, expect, it } from "vitest";
import { announcedOpEvents, changedEventTypes } from "./turn-changed-events";

const layout = {
  workspaceRel: "workspaces/Houston/Agent",
  dataRel: "workspaces/Houston/Agent/.houston/runtime",
};

describe("changedEventTypes", () => {
  it("maps family docs to their domain events", () => {
    expect(
      changedEventTypes(layout, [
        "workspaces/Houston/Agent/.houston/activity/activity.json",
        "workspaces/Houston/Agent/.houston/routine_runs/routine_runs.json",
        "workspaces/Houston/Agent/.houston/routines/routines.json",
        "workspaces/Houston/Agent/.houston/config/config.json",
        "workspaces/Houston/Agent/.houston/learnings/learnings.json",
      ]),
    ).toEqual([
      "ActivityChanged",
      "ConfigChanged",
      "LearningsChanged",
      "RoutineRunsChanged",
      "RoutinesChanged",
    ]);
  });

  it("maps conversation, file and skill writes; ignores sessions", () => {
    expect(
      changedEventTypes(layout, [
        "workspaces/Houston/Agent/.houston/runtime/sessions/c1/log.jsonl",
        "workspaces/Houston/Agent/.houston/runtime/conversations/c1.json",
        "workspaces/Houston/Agent/files/report.md",
        "workspaces/Houston/Agent/.agents/skills/foo/SKILL.md",
      ]),
    ).toEqual(["ConversationsChanged", "FilesChanged", "SkillsChanged"]);
  });

  it("dedupes and sorts", () => {
    expect(
      changedEventTypes(layout, [
        "workspaces/Houston/Agent/.houston/runtime/conversations/c1.json",
        "workspaces/Houston/Agent/.houston/activity/activity.json",
        "workspaces/Houston/Agent/.houston/runtime/conversations/c2.json",
      ]),
    ).toEqual(["ActivityChanged", "ConversationsChanged"]);
  });

  it("isolates a sibling agent's doc; classifies this agent's schema file via the canonical rule", () => {
    // A sibling agent's key is outside this turn's workspaceRel, so it never
    // contributes — cross-agent isolation holds.
    expect(
      changedEventTypes(layout, [
        "workspaces/Houston/Other/.houston/activity/activity.json",
      ]),
    ).toEqual([]);
    // The canonical classifier (agentFileEventType) is prefix-based, so this
    // agent's own activity SCHEMA file maps to ActivityChanged — a rare, safe
    // over-fire (a refetch), never a miss. Claimed turns never sync .houston
    // internals anyway (claimedTurnIncludes excludes them).
    expect(
      changedEventTypes(layout, [
        "workspaces/Houston/Agent/.houston/activity/activity.schema.json",
      ]),
    ).toEqual(["ActivityChanged"]);
  });
});

describe("announcedOpEvents", () => {
  it("announces the handler's agent events once, sorted", () => {
    expect(
      announcedOpEvents(
        [
          { type: "RoutinesChanged", agentPath: "a" },
          { type: "ActivityChanged", agentPath: "a" },
          { type: "RoutinesChanged", agentPath: "a" },
          { type: "Toast", level: "info", message: "x" },
        ],
        [],
      ),
    ).toEqual(["ActivityChanged", "RoutinesChanged"]);
  });

  it("announces nothing when a projection failed", () => {
    // Other tabs would refetch a doc that lagged: the read falls to the pod.
    expect(
      announcedOpEvents(
        [{ type: "RoutinesChanged", agentPath: "a" }],
        ["routines: PUT rejected (503)"],
      ),
    ).toEqual([]);
  });
});
