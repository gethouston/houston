import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@houston-ai/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { queryKeys } from "../../lib/query-keys";
import { tauriSharedSkills, tauriSkills } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import {
  planManifestAssignment,
  type SharedSkillRow,
} from "../../lib/workspace-shared-skills";
import {
  planSkillAssignment,
  type WorkspaceSkillRow,
} from "../../lib/workspace-skills";
import { ManageSkillBody } from "./manage-skill-body";
import { ManageSkillConfirms } from "./manage-skill-confirms";

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
}: {
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
}) {
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
      ? [...queryKeys.sharedSkills(shared.workspaceId), "detail", row?.slug]
      : queryKeys.skillDetail(canonicalPath ?? "", row?.slug ?? ""),
    queryFn: () =>
      isShared
        ? tauriSharedSkills.load(shared.workspaceId, row?.slug ?? "")
        : tauriSkills.load(canonicalPath ?? "", row?.slug ?? ""),
    enabled: row !== null && (isShared || canonicalPath !== undefined),
    staleTime: 30_000,
  });
  const [pendingRemove, setPendingRemove] = useState<{
    args: { content: string; contentDirty: boolean };
    plan: { writes: string[]; deletes: string[] };
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!row) return null;
  const assignedIds = new Set(row.agents.map((a) => a.id));
  const overriddenBy = isShared ? (row.overriddenBy ?? []) : [];
  const pathsFor = (ids: Set<string>) =>
    agents.filter((a) => ids.has(a.id)).map((a) => a.folderPath);
  const namesFor = (paths: string[]) =>
    agents
      .filter((a) => paths.includes(a.folderPath))
      .map((a) => a.name)
      .join(", ");
  const asShared = row as SharedSkillRow;

  const save = async (draft: {
    content: string;
    contentDirty: boolean;
    afterIds: Set<string>;
  }) => {
    const args = { content: draft.content, contentDirty: draft.contentDirty };
    if (isShared) {
      // Manifest toggles are reversible, so no unassign confirm here.
      await shared.onApply(
        asShared,
        args,
        planManifestAssignment({
          before: pathsFor(assignedIds),
          after: pathsFor(draft.afterIds),
        }),
      );
      onClose();
      return;
    }
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
              key={`${row.slug}:${isShared ? "shared" : canonicalPath}`}
              initialContent={detail.content}
              agents={agents}
              assignedIds={assignedIds}
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
                isShared && assignedIds.size < agents.length
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
      <ManageSkillConfirms
        row={row}
        pendingRemoveCount={pendingRemove?.plan.deletes.length ?? 0}
        pendingRemoveNames={namesFor(pendingRemove?.plan.deletes ?? [])}
        onCancelRemove={() => setPendingRemove(null)}
        onConfirmRemove={() => {
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
        confirmDelete={confirmDelete}
        deleteSharedCopy={isShared}
        onCancelDelete={() => setConfirmDelete(false)}
        onConfirmDelete={() => {
          setConfirmDelete(false);
          void (isShared ? shared.onDelete(asShared) : onDeleteEverywhere(row))
            .then(onClose)
            .catch(() => {
              // Same contract as above: failures are already toasted.
            });
        }}
      />
    </>
  );
}
