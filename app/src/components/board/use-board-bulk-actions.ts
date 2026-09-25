import type { KanbanItem } from "@houston-ai/board";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fireMissionDoneConfetti } from "../../lib/confetti";
import { logAndReportError } from "../../lib/error-report";
import {
  celebratesMissionDone,
  DONE_STATUS,
  moveTargetsForSection,
} from "../../lib/mission-selection";
import { useUIStore } from "../../stores/ui";
import type { BoardSelectionModel } from "./board-selection-model";

/**
 * The floating bulk-action-bar config for a {@link BoardSelectionModel}: move
 * targets for the locked section, move / archive / delete dispatch with
 * failure toasts, and the bar's labels. `undefined` without a selection model.
 */
export function useBoardBulkActions({
  selection,
  selectionLockColumnId,
  allItems,
  openChatId,
  onCloseOpenChat,
}: {
  selection?: BoardSelectionModel;
  selectionLockColumnId: string | null;
  allItems: KanbanItem[];
  openChatId?: string | null;
  onCloseOpenChat?: () => void;
}) {
  const { t } = useTranslation(["board", "dashboard"]);
  const addToast = useUIStore((s) => s.addToast);

  /** Run a bulk op, toasting any failure. Resolves `true` only when the op
   *  actually succeeded, so callers can chain a success-only follow-up (the
   *  Move-to-Done celebration) without re-catching. */
  const runBulk = useCallback(
    async (op: () => Promise<void>) => {
      try {
        await op();
        return true;
      } catch (err) {
        logAndReportError("bulk_update_missions", err);
        addToast({
          title: t("board:bulk.error"),
          variant: "error",
        });
        return false;
      }
    },
    [addToast, t],
  );

  // Run a bulk op that removes cards from the board; when the open chat's
  // mission is among them, deselect it AFTER the op succeeds so its panel
  // closes with the cards (membership is read before `op` — success clears
  // the selection set).
  const runBulkRemoval = useCallback(
    (op: () => Promise<void>) =>
      runBulk(async () => {
        const closesOpenChat =
          openChatId != null && selection?.selectedIds.has(openChatId);
        await op();
        if (closesOpenChat) onCloseOpenChat?.();
      }),
    [runBulk, selection, openChatId, onCloseOpenChat],
  );

  return useMemo(() => {
    if (!selection) return undefined;
    return {
      moveTargets: moveTargetsForSection(selectionLockColumnId).map(
        (status) => ({
          status,
          label:
            status === DONE_STATUS
              ? t("dashboard:columns.done")
              : t("dashboard:columns.needsYou"),
        }),
      ),
      // One celebration for the whole batch, and only once the move landed.
      // The statuses are read BEFORE the move (a successful bulk move rewrites
      // them and clears the selection): a Needs you selection can mix settled
      // and failed missions, so the batch celebrates when at least one of them
      // succeeded, and a batch of nothing but failures moves in silence.
      // No card origin here, unlike the single-card paths: a bulk move finishes
      // many cards at once, so there is no ONE card the burst belongs to — the
      // batch keeps the default rise from the bottom of the board.
      onMove: async (status: string) => {
        const fromStatuses = allItems
          .filter((a) => selection.selectedIds.has(a.id))
          .map((a) => a.status);
        const moved = await runBulk(() => selection.move(status));
        if (moved && celebratesMissionDone(status, fromStatuses))
          fireMissionDoneConfetti();
      },
      onArchive: () => runBulkRemoval(() => selection.archive()),
      onDelete: () => runBulkRemoval(() => selection.remove()),
      onClear: selection.clear,
      labels: {
        selected: (count: number) => t("board:bulk.selected", { count }),
        moveTo: t("board:bulk.moveTo"),
        archive: t("board:bulk.archive"),
        delete: t("board:bulk.delete"),
        clear: t("board:bulk.clear"),
        cancel: t("board:bulk.cancel"),
        confirmMoveTitle: t("board:bulk.confirmMove.title"),
        confirmMoveDescription: (count: number, target: string) =>
          t("board:bulk.confirmMove.description", { count, target }),
        confirmMoveAction: t("board:bulk.confirmMove.action"),
        confirmArchiveTitle: t("board:bulk.confirmArchive.title"),
        confirmArchiveDescription: (count: number) =>
          t("board:bulk.confirmArchive.description", { count }),
        confirmArchiveAction: t("board:bulk.confirmArchive.action"),
        confirmDeleteTitle: t("board:bulk.confirmDelete.title"),
        confirmDeleteDescription: (count: number) =>
          t("board:bulk.confirmDelete.description", { count }),
        confirmDeleteAction: t("board:bulk.confirmDelete.action"),
      },
    };
  }, [selection, selectionLockColumnId, allItems, runBulk, runBulkRemoval, t]);
}
