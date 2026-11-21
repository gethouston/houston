import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";

export type ManagedSkillRow = WorkspaceSkillRow & Partial<SharedSkillRow>;

export interface SharedDialogActions {
  workspaceId: string;
  onApply: (
    row: SharedSkillRow,
    args: { content: string; contentDirty: boolean },
    plan: { enable: string[]; disable: string[] },
    notice?: string,
  ) => Promise<void>;
  onDelete: (row: SharedSkillRow) => Promise<void>;
  onRevert: (row: SharedSkillRow, agent: Agent) => Promise<void>;
  onDisableForAgent: (row: SharedSkillRow, agent: Agent) => Promise<void>;
  onEnableAll: (row: SharedSkillRow) => Promise<void>;
  onAddToAgent: (
    row: SharedSkillRow,
    agent: Agent,
    notice: string,
  ) => Promise<void>;
  onPromote: (row: SharedSkillRow) => Promise<void>;
}

export interface SkillEditorActions {
  onApply: (
    row: WorkspaceSkillRow,
    args: { content: string; contentDirty: boolean },
    plan: { writes: string[]; deletes: string[] },
  ) => Promise<void>;
  onDeleteEverywhere: (row: WorkspaceSkillRow) => Promise<void>;
}
