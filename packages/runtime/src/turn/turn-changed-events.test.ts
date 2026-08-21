import { describe, expect, it } from "vitest";
import { changedEventTypes } from "./turn-changed-events";

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

  it("does not match a schema file or a sibling agent's doc", () => {
    expect(
      changedEventTypes(layout, [
        "workspaces/Houston/Agent/.houston/activity/activity.schema.json",
        "workspaces/Houston/Other/.houston/activity/activity.json",
      ]),
    ).toEqual([]);
  });
});
