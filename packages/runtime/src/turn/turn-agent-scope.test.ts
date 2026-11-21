import { expect, test } from "vitest";
import { agentScopeIncludes } from "./turn-agent-scope";

const ROOT = "workspaces/Personal/Bob";

test.each([
  `${ROOT}/.houston/routines/routines.json`,
  `${ROOT}/.houston/learnings/learnings.json`,
  "custom-integrations.json",
  `${ROOT}/.agents/skills/example/SKILL.md`,
  `${ROOT}/notes.md`,
  `${ROOT}/.houston/state/signup_slack_alerts.json`,
  `${ROOT}/.houston/cache/seen.json`,
])("agent scope includes %s", (path) => {
  expect(agentScopeIncludes(path, ROOT)).toBe(true);
});

test.each([
  `${ROOT}/.houston/runtime/settings.json`,
  `${ROOT}/.houston/runtime/conversations/c1.json`,
  `${ROOT}/.houston/docs/activity/activity.json`,
  `${ROOT}/.houston/routines/other.json`,
  `${ROOT}/.houston/learnings/other.json`,
  `${ROOT}/.houston/config/config.json`,
  `${ROOT}/.houston/activity/activity.json`,
  `${ROOT}/.houston/routine_runs/routine_runs.json`,
  `${ROOT}/.houston/skills/x/SKILL.md`,
  `${ROOT}/.houston/skills-manifest/skills-manifest.json`,
  `${ROOT}/.houston/sessions/claude/x.sid`,
  `${ROOT}/.houston/memory/learnings.md`,
  `${ROOT}/.houston/prompts/system.md`,
  `${ROOT}/.houston/migration/state.json`,
  `${ROOT}/.houston/agent.json`,
  `${ROOT}/.houston/state//x.json`,
  `${ROOT}/.houston/state/../runtime/auth.json`,
  "workspaces/Personal/Alice/notes.md",
  "workspaces/Personal/Alice/.houston/state/x.json",
])("agent scope excludes %s", (path) => {
  expect(agentScopeIncludes(path, ROOT)).toBe(false);
});
