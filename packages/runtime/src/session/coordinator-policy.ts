import { join } from "node:path";
import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import { UPLOADS_DIR } from "@houston/domain/uploads-dir";
import { learningsDocPath } from "./learnings-context";
import { SPILL_DIR } from "./tool-results/spill";
import type { WorkspaceGuardOptions } from "./tools/fs-guard";

export interface RuntimeFilePolicyInput {
  role: AssistantRuntimeRole | null;
  workspaceDir: string;
  sharedSkillsDir: string;
  sharedSkillsSnapshot?: string;
}

export function sharedRootsFor(input: RuntimeFilePolicyInput): string[] {
  if (input.role === "coordinator") return [];
  return input.sharedSkillsDir ? [input.sharedSkillsDir] : [];
}

export function fileToolGuardOptions(
  input: RuntimeFilePolicyInput,
): WorkspaceGuardOptions {
  if (input.role === "coordinator") {
    return {
      allowedFiles: [learningsDocPath(input.workspaceDir)],
      readableDirs: [
        join(input.workspaceDir, UPLOADS_DIR),
        join(input.workspaceDir, SPILL_DIR),
      ],
    };
  }
  return {
    sharedRoots: sharedRootsFor(input),
    ...(input.sharedSkillsSnapshot
      ? { readOnlyRoots: [input.sharedSkillsSnapshot] }
      : {}),
  };
}

export function readsRoutineResults(
  role: AssistantRuntimeRole | null,
): boolean {
  return role !== "coordinator";
}
