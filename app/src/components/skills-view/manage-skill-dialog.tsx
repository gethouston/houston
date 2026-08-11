import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  Skeleton,
} from "@houston-ai/core";
import { EditableSkillTitle, skillRenameEscapeGuard } from "@houston-ai/skills";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { queryKeys } from "../../lib/query-keys";
import { withSkillTitle } from "../../lib/skill-title";
import { tauriSharedSkills, tauriSkills } from "../../lib/tauri";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import { ManageSkillBody } from "./manage-skill-body";
import { ManageSkillConfirms } from "./manage-skill-confirms";
import type { ManageSkillDialogProps } from "./manage-skill-dialog-props";
import { useManageSkillSave } from "./use-manage-skill-save";
import { useMissingSkillDismiss } from "./use-missing-skill-dismiss";

export type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./manage-skill-dialog-props";

/**
 * The global skill's one detail surface (HOU-792, store-backed since ADR
 * 0003). For a workspace-shared row the content is the STORE copy: a save is
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
  const isShared = shared !== undefined && row?.origin === "shared";
  // On a shared-store deployment a LOCAL row never offers copy fan-out:
  // holders render read-only and multi-agent use goes through "Share to
  // workspace" (ADR 0003), so the checkbox list can't be mistaken for the
  // org-level assignment it isn't.
  const assignment = hideAssignment
    ? ("hidden" as const)
    : shared !== undefined && row?.origin === "local"
      ? ("locked" as const)
      : ("editable" as const);
  const canonicalPath = row?.agents[0]?.folderPath;
  const { data: detail, error } = useQuery({
    queryKey: isShared
      ? queryKeys.sharedSkillDetail(shared.workspaceId, row?.slug ?? "")
      : queryKeys.skillDetail(canonicalPath ?? "", row?.slug ?? ""),
    queryFn: () =>
      isShared
        ? tauriSharedSkills.load(shared.workspaceId, row?.slug ?? "")
        : tauriSkills.load(canonicalPath ?? "", row?.slug ?? ""),
    enabled: row !== null && (isShared || canonicalPath !== undefined),
    staleTime: 30_000,
  });
  const flow = useManageSkillSave({
    row,
    agents,
    isShared,
    shared,
    onApply,
    onDeleteEverywhere,
    onClose,
  });
  // The header pencil's uncommitted rename (PRODUCT-1018): saved into the
  // frontmatter `title:` when Save changes runs; the slug never moves.
  const [rename, setRename] = useState<string | null>(null);
  const slug = row?.slug;
  // biome-ignore lint/correctness/useExhaustiveDependencies: slug is the intentional change-trigger — a pending rename must die with the row it was typed for; the effect body deliberately reads none of it.
  useEffect(() => {
    setRename(null);
  }, [slug]);
  useMissingSkillDismiss({ row, error, isShared, shared, onClose });

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
              agents={agents}
              assignedIds={flow.assignedIds}
              allowEmptySelection={isShared}
              assignment={assignment}
              overrides={
                isShared && overriddenBy.length > 0
                  ? {
                      agents: agents.filter((a) =>
                        overriddenBy.some((o) => o.id === a.id),
                      ),
                      onRevert: (agent) => shared.onRevert(asShared, agent),
                    }
                  : undefined
              }
              onEnableAll={
                isShared && flow.assignedIds.size < agents.length
                  ? () => shared.onEnableAll(asShared)
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
