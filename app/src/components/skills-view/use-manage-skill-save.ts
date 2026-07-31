import { useState } from "react";
import type { Agent } from "../../lib/types";
import {
  planManifestAssignment,
  type SharedSkillRow,
} from "../../lib/workspace-shared-skills";
import { planSkillAssignment } from "../../lib/workspace-skills";
import type {
  ManagedSkillRow,
  ManageSkillDialogProps,
} from "./manage-skill-dialog-props";

/**
 * {@link ManageSkillDialog}'s save + destructive-confirm flow, split out for
 * the file law. A shared row's save is one store write plus reversible
 * manifest toggles (no confirm); a copy-based save that unassigns agents
 * parks as `pendingRemove` until the confirm dialog resolves it. Delete goes
 * through `confirmDelete` either way. Failures are already toasted by the
 * `call` wrapper — catches here only prevent unhandled rejections, and the
 * dialog stays open so the user can retry.
 */
export function useManageSkillSave(args: {
  row: ManagedSkillRow | null;
  agents: Agent[];
  isShared: boolean;
  shared: ManageSkillDialogProps["shared"];
  onApply: ManageSkillDialogProps["onApply"];
  onDeleteEverywhere: ManageSkillDialogProps["onDeleteEverywhere"];
  onClose: () => void;
}) {
  const { row, agents, isShared, shared, onApply, onDeleteEverywhere } = args;
  const [pendingRemove, setPendingRemove] = useState<{
    args: { content: string; contentDirty: boolean };
    plan: { writes: string[]; deletes: string[] };
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const assignedIds = new Set((row?.agents ?? []).map((a) => a.id));
  const pathsFor = (ids: ReadonlySet<string>) =>
    agents.filter((a) => ids.has(a.id)).map((a) => a.folderPath);
  const namesFor = (paths: string[]) =>
    agents
      .filter((a) => paths.includes(a.folderPath))
      .map((a) => a.name)
      .join(", ");

  const save = async (draft: {
    content: string;
    contentDirty: boolean;
    afterIds: Set<string>;
  }) => {
    if (!row) return;
    const saveArgs = {
      content: draft.content,
      contentDirty: draft.contentDirty,
    };
    if (isShared && shared) {
      // Manifest toggles are reversible, so no unassign confirm here.
      await shared.onApply(
        row as SharedSkillRow,
        saveArgs,
        planManifestAssignment({
          before: pathsFor(assignedIds),
          after: pathsFor(draft.afterIds),
        }),
      );
      args.onClose();
      return;
    }
    const plan = planSkillAssignment({
      contentDirty: draft.contentDirty,
      before: pathsFor(assignedIds),
      after: pathsFor(draft.afterIds),
    });
    if (plan.deletes.length > 0) {
      setPendingRemove({ args: saveArgs, plan });
      return;
    }
    await onApply(row, saveArgs, plan);
    args.onClose();
  };

  return {
    assignedIds,
    save,
    confirmDelete,
    openConfirmDelete: () => setConfirmDelete(true),
    cancelConfirmDelete: () => setConfirmDelete(false),
    confirmDeleteNow: () => {
      setConfirmDelete(false);
      if (!row) return;
      void (
        isShared && shared
          ? shared.onDelete(row as SharedSkillRow)
          : onDeleteEverywhere(row)
      )
        .then(args.onClose)
        .catch(() => {});
    },
    pendingRemoveCount: pendingRemove?.plan.deletes.length ?? 0,
    pendingRemoveNames: namesFor(pendingRemove?.plan.deletes ?? []),
    cancelRemove: () => setPendingRemove(null),
    confirmRemove: () => {
      const pending = pendingRemove;
      setPendingRemove(null);
      if (!pending || !row) return;
      void onApply(row, pending.args, pending.plan)
        .then(args.onClose)
        .catch(() => {});
    },
  };
}
