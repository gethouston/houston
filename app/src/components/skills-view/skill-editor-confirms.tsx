import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import type { ScopedActKind } from "./scoped-skill-actions";

/**
 * The editor's destructive handshakes, split out for the 200-line rule.
 * Copy-based rows confirm unassignment (copies get deleted) and
 * delete-everywhere; a store-backed row reaches only the delete confirm, with
 * copy that says modified per-agent versions survive.
 *
 * The third handshake belongs to an employee that keeps its OWN version of a
 * workspace skill: both scoped acts delete that version, and neither reads as
 * a delete from the control that starts it.
 */
export function SkillEditorConfirms({
  row,
  pendingRemoveCount,
  pendingRemoveNames,
  onConfirmRemove,
  onCancelRemove,
  confirmDelete,
  deleteSharedCopy,
  onConfirmDelete,
  onCancelDelete,
  scopedAct,
  onConfirmScopedAct,
  onCancelScopedAct,
}: {
  row: WorkspaceSkillRow;
  /** >0 opens the unassign confirm (copy-based saves only). */
  pendingRemoveCount: number;
  pendingRemoveNames: string;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  confirmDelete: boolean;
  /** Store-backed row: the delete copy names the workspace, not agents. */
  deleteSharedCopy: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  /** The scoped act awaiting its handshake, or null while none is. */
  scopedAct: ScopedActKind | null;
  onConfirmScopedAct: () => Promise<void>;
  onCancelScopedAct: () => void;
}) {
  const { t } = useTranslation(["skills", "common"]);
  const scopedCopy =
    scopedAct === "revert"
      ? {
          title: t("skills:global.scopedOverride.revertConfirmTitle"),
          description: t("skills:global.scopedOverride.revertConfirmBody"),
          confirm: t("skills:global.manage.revert"),
        }
      : {
          title: t("skills:global.scopedOverride.disableConfirmTitle"),
          description: t("skills:global.scopedOverride.disableConfirmBody"),
          confirm: t("skills:global.manage.disableForAgent"),
        };
  return (
    <>
      <ConfirmDialog
        open={pendingRemoveCount > 0}
        onOpenChange={(open) => !open && onCancelRemove()}
        title={t("skills:global.manage.removeConfirmTitle", {
          count: pendingRemoveCount,
        })}
        description={t("skills:global.manage.removeConfirmDescription", {
          names: pendingRemoveNames,
        })}
        confirmLabel={t("skills:detail.saveChanges")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={onConfirmRemove}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => !open && onCancelDelete()}
        title={t("skills:global.manage.deleteConfirmTitle", {
          name: skillDisplayTitle(row.summary),
        })}
        description={
          deleteSharedCopy
            ? t("skills:global.manage.deleteSharedDescription")
            : t("skills:global.manage.deleteConfirmDescription", {
                count: row.agents.length,
                names: row.agents.map((a) => a.name).join(", "),
              })
        }
        confirmLabel={t("common:actions.delete")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={onConfirmDelete}
      />
      <ConfirmDialog
        open={scopedAct !== null}
        onOpenChange={(open) => !open && onCancelScopedAct()}
        title={scopedCopy.title}
        description={scopedCopy.description}
        confirmLabel={scopedCopy.confirm}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={onConfirmScopedAct}
      />
    </>
  );
}
