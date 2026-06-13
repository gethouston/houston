import { test, expect } from "bun:test";
import { classifyChange } from "./classify";

/**
 * Path → reactivity event, matching engine/houston-file-watcher. The tricky bit
 * is routine_runs vs routines (prefix overlap) and that only files INSIDE an
 * agent produce events.
 */

const cases: [string, string | null, string | null][] = [
  // [relPath, expected type, expected agentPath]
  ["Work/Sales/.houston/activity/activity.json", "ActivityChanged", "Work/Sales"],
  ["Work/Sales/.houston/routines/routines.json", "RoutinesChanged", "Work/Sales"],
  ["Work/Sales/.houston/routine_runs/routine_runs.json", "RoutineRunsChanged", "Work/Sales"],
  ["Work/Sales/.houston/config/config.json", "ConfigChanged", "Work/Sales"],
  ["Work/Sales/.houston/learnings/learnings.json", "LearningsChanged", "Work/Sales"],
  ["Work/Sales/.houston/conversations/c1.json", "ConversationsChanged", "Work/Sales"],
  ["Work/Sales/.houston/sessions/anthropic/s1.json", "ConversationsChanged", "Work/Sales"],
  ["Work/Sales/.agents/skills/research/SKILL.md", "SkillsChanged", "Work/Sales"],
  ["Work/Sales/.claude/skills/research", "SkillsChanged", "Work/Sales"],
  ["Work/Sales/CLAUDE.md", "ContextChanged", "Work/Sales"],
  ["Work/Sales/AGENTS.md", "ContextChanged", "Work/Sales"],
  ["Work/Sales/report.xlsx", "FilesChanged", "Work/Sales"],
  ["Work/Sales/subdir/notes.md", "FilesChanged", "Work/Sales"],
  // Not classifiable:
  ["Work/Sales/.git/index", null, null],
  ["Work/Sales/.DS_Store", null, null],
  ["Work", null, null], // not inside an agent
  ["Work/Sales", null, null], // the agent dir itself, no file
];

for (const [relPath, type, agentPath] of cases) {
  test(`classify ${relPath} → ${type ?? "(none)"}`, () => {
    const event = classifyChange(relPath);
    if (type === null) {
      expect(event).toBeNull();
    } else {
      expect(event).toEqual({ type, agentPath } as never);
    }
  });
}

test("routine_runs is not misclassified as routines (prefix overlap)", () => {
  expect(classifyChange("W/A/.houston/routine_runs/x.json")?.type).toBe("RoutineRunsChanged");
  expect(classifyChange("W/A/.houston/routines/x.json")?.type).toBe("RoutinesChanged");
});

test("windows-style backslashes are handled", () => {
  expect(classifyChange("W\\A\\.houston\\activity\\activity.json")).toEqual({
    type: "ActivityChanged",
    agentPath: "W/A",
  } as never);
});
