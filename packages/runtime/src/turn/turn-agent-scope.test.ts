import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  agentScopeIncludes,
  HOUSTON_OWNED_DIRS,
  HOUSTON_OWNED_FILES,
} from "./turn-agent-scope";
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

test("the owned names match the vectors the store's rule reads", () => {
  expect([...HOUSTON_OWNED_DIRS].sort()).toEqual([...vectors.ownedDirs].sort());
  expect([...HOUSTON_OWNED_FILES].sort()).toEqual(
    [...vectors.ownedFiles].sort(),
  );
});

test.each([
  ...vectors.ownedDirs.map((name) => `${ROOT}/.houston/${name}/x.json`),
  ...vectors.ownedFiles.map((name) => `${ROOT}/.houston/${name}`),
])("agent scope excludes the owned %s", (path) => {
  expect(agentScopeIncludes(path, ROOT)).toBe(false);
});

test("the vectors match cloud internal/podstore/testdata/turn-agent-scope.vectors.json byte for byte", () => {
  const bytes = readFileSync(
    new URL("./turn-agent-scope.vectors.json", import.meta.url),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "17c6287f586f34936c2137efd3e4f27c31a7624b3f2575b717fdcf8f3b10c59c",
  );
});
