import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  Skeleton,
} from "@houston-ai/core";
import { EditableSkillTitle, skillRenameEscapeGuard } from "@houston-ai/skills";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { withSkillTitle } from "../../lib/skill-title";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import { ManageSkillBody } from "./manage-skill-body";
import { ManageSkillConfirms } from "./manage-skill-confirms";
import type { ManageSkillDialogProps } from "./manage-skill-dialog-props";
import { useManageSkillSave } from "./use-manage-skill-save";
import { useSkillDetailSurface } from "./use-skill-detail-surface";

export type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./manage-skill-dialog-props";

/**
 * A skill's detail surface on the PER-AGENT Skills tab (HOU-792, store-backed
 * since ADR 0003); the shared library edits a skill on its own full page
 * instead. For a workspace-shared row the content is the STORE copy: a save is
 * one store write plus reversible per-agent manifest toggles (so unassigning
 * needs no confirm), and agents holding a modified copy surface as overrides
 * with a revert. Copy-based rows (local skills, or deployments without the
 * store) keep the fan-out semantics: canonical content is the first holder's
 * copy, unassignment deletes copies behind a confirm.
 */
export function ManageSkillDialog({
  row,
  agents,
  onApply,
  onDeleteEverywhere,
  onClose,
  onEditInChat,
  shared,
  hideAssignment = false,
  onDisableForAgent,
}: ManageSkillDialogProps) {
  const { t } = useTranslation(["skills", "common"]);
  const surface = useSkillDetailSurface({ row, shared, onLeave: onClose });
  const { isShared, store, canonicalPath, detail, error, rename, setRename } =
    surface;
  // The per-agent dialog edits ONLY that agent's copy, so it shows no
  // assignment section at all; every other mode is the shared origin rule.
  const assignment = hideAssignment ? ("hidden" as const) : surface.assignment;
  const flow = useManageSkillSave({
    row,
    agents,
    isShared,
    shared,
    onApply,
    onDeleteEverywhere,
    onSaved: onClose,
    onDeleted: onClose,
  });

  if (!row) return null;
  const overriddenBy = isShared ? (row.overriddenBy ?? []) : [];
  const asShared = row as SharedSkillRow;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="sm:max-w-2xl"
          onEscapeKeyDown={skillRenameEscapeGuard}
        >
          <DialogHeader className="min-w-0">
            <EditableSkillTitle
              title={rename ?? skillDisplayTitle(row.summary)}
              onRename={detail ? setRename : undefined}
              renameLabel={t("skills:detail.rename")}
            />
            {row.summary.description && (
              <DialogDescription className="line-clamp-2">
                {row.summary.description}
              </DialogDescription>
            )}
          </DialogHeader>
          {detail ? (
            <ManageSkillBody
              key={`${row.slug}:${isShared ? "shared" : canonicalPath}`}
              initialContent={detail.content}
              workflow={detail.workflow}
              agents={agents}
              assignedIds={flow.assignedIds}
              allowEmptySelection={isShared}
              assignment={assignment}
              overrides={
                store && overriddenBy.length > 0
                  ? {
                      agents: agents.filter((a) =>
                        overriddenBy.some((o) => o.id === a.id),
                      ),
                      onRevert: (agent) => store.onRevert(asShared, agent),
                    }
                  : undefined
              }
              onEnableAll={
                store && flow.assignedIds.size < agents.length
                  ? () => store.onEnableAll(asShared)
                  : undefined
              }
              onPromote={
                shared !== undefined && row.origin === "local"
                  ? async () => {
                      await shared.onPromote(asShared);
                      onClose();
                    }
                  : undefined
              }
              forceDirty={rename !== null}
              onSave={(draft) =>
                flow.save({
                  content:
                    rename !== null
                      ? withSkillTitle(draft.content, rename)
                      : draft.content,
                  contentDirty: draft.contentDirty || rename !== null,
                  afterIds: draft.afterIds,
                })
              }
              onDeleteEverywhere={
                isShared && onDisableForAgent
                  ? () =>
                      void onDisableForAgent()
                        .then(onClose)
                        .catch(() => {
                          // Failure already toasted by the manifest write.
                        })
                  : flow.openConfirmDelete
              }
              deleteLabel={
                isShared && onDisableForAgent
                  ? t("skills:global.manage.disableForAgent")
                  : undefined
              }
              onCancel={onClose}
              onEditInChat={
                onEditInChat
                  ? () => {
                      onClose();
                      onEditInChat(row);
                    }
                  : undefined
              }
            />
          ) : error ? (
            <p className="text-sm text-ink-muted">
              {t("skills:detail.loadFailed")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ManageSkillConfirms
        row={row}
        pendingRemoveCount={flow.pendingRemoveCount}
        pendingRemoveNames={flow.pendingRemoveNames}
        onCancelRemove={flow.cancelRemove}
        onConfirmRemove={flow.confirmRemove}
        confirmDelete={flow.confirmDelete}
        deleteSharedCopy={isShared}
        onCancelDelete={flow.cancelConfirmDelete}
        onConfirmDelete={flow.confirmDeleteNow}
      />
    </>
  );
}
