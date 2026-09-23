import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";

/**
 * The props contract the skill editor and the hooks behind it share, split out
 * for the file law so none of them has to import another's module.
 */

/** A list row: copy-based everywhere, store-backed when the deployment shares. */
export type ManagedSkillRow = WorkspaceSkillRow & Partial<SharedSkillRow>;

/** Store-backed handlers; present only when `capabilities.sharedSkills`. */
export interface SharedDialogActions {
  workspaceId: string;
  onApply: (
    row: SharedSkillRow,
    args: { content: string; contentDirty: boolean },
    plan: { enable: string[]; disable: string[] },
    /** The success toast; the editor's "Skill updated" when omitted. */
    notice?: string,
  ) => Promise<void>;
  onDelete: (row: SharedSkillRow) => Promise<void>;
  onRevert: (row: SharedSkillRow, agent: Agent) => Promise<void>;
  /** Stop ONE agent loading a workspace skill: the manifest entry off and the
   *  agent's own shadowing copy, which loads with or without an entry, dropped
   *  with it. */
  onDisableForAgent: (row: SharedSkillRow, agent: Agent) => Promise<void>;
  onEnableAll: (row: SharedSkillRow) => Promise<void>;
  /** Move a per-agent (local) row into the store — "Share to workspace". */
  onPromote: (row: SharedSkillRow) => Promise<void>;
}

/** The two writes every skill editor commits, whatever its scope. */
export interface SkillEditorActions {
  onApply: (
    row: WorkspaceSkillRow,
    args: { content: string; contentDirty: boolean },
    plan: { writes: string[]; deletes: string[] },
  ) => Promise<void>;
  onDeleteEverywhere: (row: WorkspaceSkillRow) => Promise<void>;
}
