import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSkillDetail } from "../../hooks/queries";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { Agent } from "../../lib/types";
import {
  planSkillAssignment,
  type WorkspaceSkillRow,
} from "../../lib/workspace-skills";
import { ManageSkillBody } from "./manage-skill-body";

/**
 * The global skill's one detail surface (HOU-792): edit the SKILL.md and
 * choose which agents hold a copy, in one dialog. The canonical content is the
 * FIRST holder's copy; a save writes it to newly assigned agents always, and
 * to existing holders only when the content itself was edited (an
 * assignment-only save never clobbers a divergent per-agent copy). Removals
 * are destructive, so a save that unassigns agents confirms first, naming
 * them; Delete removes the skill from every holder behind the same handshake.
 */
export function ManageSkillDialog({
  row,
  agents,
  onApply,
  onDeleteEverywhere,
  onClose,
  onEditInChat,
}: {
  /** The open row; null keeps the dialog closed. */
  row: WorkspaceSkillRow | null;
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
}) {
  const { t } = useTranslation(["skills", "common"]);
  const canonicalPath = row?.agents[0]?.folderPath;
  const { data: detail, error } = useSkillDetail(canonicalPath, row?.slug);
  const [pendingRemove, setPendingRemove] = useState<{
    args: { content: string; contentDirty: boolean };
    plan: { writes: string[]; deletes: string[] };
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!row) return null;
  const assignedIds = new Set(row.agents.map((a) => a.id));
  const pathsFor = (ids: Set<string>) =>
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
    const args = { content: draft.content, contentDirty: draft.contentDirty };
    const plan = planSkillAssignment({
      contentDirty: draft.contentDirty,
      before: pathsFor(assignedIds),
      after: pathsFor(draft.afterIds),
    });
    if (plan.deletes.length > 0) {
      setPendingRemove({ args, plan });
      return;
    }
    await onApply(row, args, plan);
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader className="min-w-0">
            <DialogTitle className="truncate">
              {skillDisplayTitle(row.summary)}
            </DialogTitle>
            {row.summary.description && (
              <DialogDescription className="line-clamp-2">
                {row.summary.description}
              </DialogDescription>
            )}
          </DialogHeader>
          {detail ? (
            <ManageSkillBody
              key={`${row.slug}:${canonicalPath}`}
              initialContent={detail.content}
              agents={agents}
              assignedIds={assignedIds}
              onSave={save}
              onDeleteEverywhere={() => setConfirmDelete(true)}
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
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={t("skills:global.manage.removeConfirmTitle", {
          count: pendingRemove?.plan.deletes.length ?? 0,
        })}
        description={t("skills:global.manage.removeConfirmDescription", {
          names: namesFor(pendingRemove?.plan.deletes ?? []),
        })}
        confirmLabel={t("skills:detail.saveChanges")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={() => {
          const pending = pendingRemove;
          setPendingRemove(null);
          if (!pending) return;
          void onApply(row, pending.args, pending.plan)
            .then(onClose)
            .catch(() => {
              // Failures already toasted by the fan-out (`call` wrapper);
              // catching only prevents an unhandled rejection. Dialog stays
              // open so the user can retry.
            });
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("skills:global.manage.deleteConfirmTitle", {
          name: skillDisplayTitle(row.summary),
        })}
        description={t("skills:global.manage.deleteConfirmDescription", {
          count: row.agents.length,
          names: row.agents.map((a) => a.name).join(", "),
        })}
        confirmLabel={t("common:actions.delete")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={() => {
          setConfirmDelete(false);
          void onDeleteEverywhere(row)
            .then(onClose)
            .catch(() => {
              // Same contract as above: failures are already toasted.
            });
        }}
      />
    </>
  );
}
