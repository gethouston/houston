import { expect, test } from "vitest";
import { agentScopeIncludes } from "./turn-agent-scope";

const ROOT = "workspaces/Personal/Bob";

test.each([
  `${ROOT}/.houston/routines/routines.json`,
  `${ROOT}/.houston/learnings/learnings.json`,
  "custom-integrations.json",
  `${ROOT}/.agents/skills/example/SKILL.md`,
  `${ROOT}/notes.md`,
])("agent scope includes %s", (path) => {
  expect(agentScopeIncludes(path, ROOT)).toBe(true);
});

test.each([
  `${ROOT}/.houston/runtime/settings.json`,
  `${ROOT}/.houston/runtime/conversations/c1.json`,
  "workspaces/Personal/Alice/notes.md",
])("agent scope excludes %s", (path) => {
  expect(agentScopeIncludes(path, ROOT)).toBe(false);
});
