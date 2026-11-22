import { expect, test } from "vitest";
import { agentScopeIncludes } from "./turn-agent-scope";
import vectors from "./turn-agent-scope.vectors.json";

const ROOT = "workspaces/Personal/Bob";

const workspaceOf = (path: string) =>
  path.startsWith("workspace/") ? "workspace" : ROOT;

test.each(vectors.allow)("agent scope includes %s", (path) => {
  expect(agentScopeIncludes(path, workspaceOf(path))).toBe(true);
});

test.each(vectors.deny)("agent scope excludes %s", (path) => {
  expect(agentScopeIncludes(path, workspaceOf(path))).toBe(false);
});

test.each([
  "workspaces/Personal/Alice/notes.md",
  "workspaces/Personal/Alice/.houston/state/x.json",
  "workspaces/Personal/Alice/.houston/state.json",
])("agent scope excludes another agent's %s", (path) => {
  expect(agentScopeIncludes(path, ROOT)).toBe(false);
});
