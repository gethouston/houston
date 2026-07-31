import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";

/** Props contract for {@link ManageSkillDialog}, split out for the file law. */

/** A page row: copy-based everywhere, store-backed when the deployment shares. */
export type ManagedSkillRow = WorkspaceSkillRow & Partial<SharedSkillRow>;

/** Store-backed handlers; present only when `capabilities.sharedSkills`. */
export interface SharedDialogActions {
  workspaceId: string;
  onApply: (
    row: SharedSkillRow,
    args: { content: string; contentDirty: boolean },
    plan: { enable: string[]; disable: string[] },
  ) => Promise<void>;
  onDelete: (row: SharedSkillRow) => Promise<void>;
  onRevert: (row: SharedSkillRow, agent: Agent) => Promise<void>;
  onEnableAll: (row: SharedSkillRow) => Promise<void>;
  /** Move a per-agent (local) row into the store — "Share to workspace". */
  onPromote: (row: SharedSkillRow) => Promise<void>;
}

export interface ManageSkillDialogProps {
  /** The open row; null keeps the dialog closed. */
  row: ManagedSkillRow | null;
  agents: Agent[];
  onApply: (
    row: WorkspaceSkillRow,
    args: { content: string; contentDirty: boolean },
    plan: { writes: string[]; deletes: string[] },
  ) => Promise<void>;
  onDeleteEverywhere: (row: WorkspaceSkillRow) => Promise<void>;
  onClose: () => void;
  /** Open the skill's guided setup chat (closes this dialog first). */
  onEditInChat?: (row: WorkspaceSkillRow) => void;
  shared?: SharedDialogActions;
  /** Per-agent surface: no "Agents with this skill" section at all — the
   *  dialog edits ONLY that agent's copy; cross-agent management lives on
   *  the global Skills page. */
  hideAssignment?: boolean;
  /** Per-agent surface on a SHARED row: the danger action means "disable for
   *  this agent" (a reversible manifest write — no confirm), never deleting
   *  the workspace copy. */
  onDisableForAgent?: () => Promise<void>;
}
