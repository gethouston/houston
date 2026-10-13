import { join } from "node:path";
import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import { UPLOADS_DIR } from "@houston/domain/uploads-dir";
import { learningsDocPath } from "./learnings-context";
import type { WorkspaceGuardOptions } from "./tools/fs-guard";

/**
 * What the COORDINATOR runtime is allowed to touch on disk.
 *
 * The coordinator is the user's personal assistant: it operates Houston through
 * the assistant tool family and hands every piece of real work to one of the
 * user's agents. It produces nothing itself, so it needs exactly ONE document —
 * its memory, and only to READ: `save_learning` is the one writer, archiving
 * what a consolidation replaces under the host's doc lock
 * (routes/learning-write.ts), so a file write could only lose memories.
 * Everything else an ordinary agent may touch is reach it has no use for and
 * that a prompt injection would: the workspace-shared skills mirror (a skill
 * edited there runs inside every one of the user's agents), the workspace
 * context documents, its own session records.
 *
 * So its file tools are given an exact-file allowlist rather than a root, and
 * no shared root at all. The one widening is READ-ONLY: the folder where what
 * people send it lands (a photo in the composer, a PDF over Slack or WhatsApp),
 * which it must be able to look at to help with it. It can never change those
 * files, so one poisoned attachment cannot rewrite the next. An ordinary agent
 * keeps the workspace containment it has always had.
 */

export interface RuntimeFilePolicyInput {
  role: AssistantRuntimeRole | null;
  /** This runtime's agent directory. */
  workspaceDir: string;
  /** The workspace-shared skills mirror, or "" where none is mounted. */
  sharedSkillsDir: string;
  /**
   * A pooled turn's READ-ONLY snapshot of its org's shared skills
   * (turn/turn-shared-skills.ts): readable like the mirror, never writable.
   */
  sharedSkillsSnapshot?: string;
}

/** The shared (writable) roots this runtime's file tools get. */
export function sharedRootsFor(input: RuntimeFilePolicyInput): string[] {
  if (input.role === "coordinator") return [];
  return input.sharedSkillsDir ? [input.sharedSkillsDir] : [];
}

/** The workspace-guard options this runtime's file tools are built with. */
export function fileToolGuardOptions(
  input: RuntimeFilePolicyInput,
): WorkspaceGuardOptions {
  if (input.role === "coordinator") {
    return {
      readableFiles: [learningsDocPath(input.workspaceDir)],
      readableDirs: [join(input.workspaceDir, UPLOADS_DIR)],
    };
  }
  return {
    sharedRoots: sharedRootsFor(input),
    ...(input.sharedSkillsSnapshot
      ? { readOnlyRoots: [input.sharedSkillsSnapshot] }
      : {}),
  };
}
