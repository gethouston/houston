import { expect, test } from "vitest";
import { fileToolGuardOptions, sharedRootsFor } from "./coordinator-policy";
import { learningsDocPath } from "./learnings-context";

/**
 * The coordinator produces no work, so it needs no working files: one document
 * (its memory) and nothing else. What this pins is the gap between that and an
 * ordinary agent, whose workspace containment must stay exactly as it was.
 */

const workspaceDir = "/data/ws/.assistant";
const sharedSkillsDir = "/data/ws/.shared/skills";

test("the coordinator's file tools are scoped to its memory document", () => {
  expect(
    fileToolGuardOptions({
      role: "coordinator",
      workspaceDir,
      sharedSkillsDir,
    }),
  ).toEqual({ allowedFiles: [learningsDocPath(workspaceDir)] });
});

test("the coordinator gets no shared skills root to write to", () => {
  // A skill edited there runs inside every one of the user's agents, so it is
  // reach the one chat that never does work has no use for.
  expect(
    sharedRootsFor({ role: "coordinator", workspaceDir, sharedSkillsDir }),
  ).toEqual([]);
});

test("an ordinary agent keeps its workspace and the shared mirror", () => {
  const policy = {
    role: null,
    workspaceDir: "/data/ws/Writer",
    sharedSkillsDir,
  };
  expect(sharedRootsFor(policy)).toEqual([sharedSkillsDir]);
  expect(fileToolGuardOptions(policy)).toEqual({
    sharedRoots: [sharedSkillsDir],
  });
});

test("no mirror mounted means no shared root, for either role", () => {
  expect(
    sharedRootsFor({ role: null, workspaceDir, sharedSkillsDir: "" }),
  ).toEqual([]);
  expect(
    fileToolGuardOptions({ role: null, workspaceDir, sharedSkillsDir: "" }),
  ).toEqual({ sharedRoots: [] });
});
