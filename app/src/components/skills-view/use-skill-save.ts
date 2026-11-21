import { useState } from "react";
import { logAndReportError } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import type {
  ManagedSkillRow,
  SharedDialogActions,
  SkillEditorActions,
} from "./skill-editor-props";

export function useSkillSave(args: {
  row: ManagedSkillRow | null;
  agent: Agent;
  isShared: boolean;
  shared: SharedDialogActions | undefined;
  onApply: SkillEditorActions["onApply"];
  onDeleteEverywhere: SkillEditorActions["onDeleteEverywhere"];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { row, agent, isShared, shared, onApply, onDeleteEverywhere } = args;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (draft: { content: string; contentDirty: boolean }) => {
    if (!row) return;
    const saveArgs = {
      content: draft.content,
      contentDirty: draft.contentDirty,
    };
    if (isShared && shared) {
      await shared.onApply(row as SharedSkillRow, saveArgs, {
        enable: [],
        disable: [],
      });
    } else {
      await onApply(row, saveArgs, {
        writes: draft.contentDirty ? [agent.folderPath] : [],
        deletes: [],
      });
    }
    args.onSaved();
  };

  return {
    save,
    confirmDelete,
    openConfirmDelete: () => setConfirmDelete(true),
    cancelConfirmDelete: () => setConfirmDelete(false),
    confirmDeleteNow: () => {
      setConfirmDelete(false);
      if (!row) return;
      const mine = {
        ...row,
        agents: row.agents.filter((holder) => holder.id === agent.id),
      };
      void onDeleteEverywhere(mine)
        .then(args.onDeleted)
        .catch((err: unknown) => logAndReportError("skill_delete", err));
    },
  };
}
