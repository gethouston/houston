import { useCallback } from "react";
import type { KanbanItem } from "@houston-ai/board";
import {
  MissionWorktreeCardAction,
  MissionWorktreePanelActions,
} from "../mission-worktree-actions";

/**
 * The "open worktree terminal" action shown on a card and in its detail-panel
 * header. Identical for both board views — only the per-item agent path (read
 * from `item.metadata`) differs, which the worktree components already handle.
 */
export function useMissionCardActions(
  onRun: (item: KanbanItem) => void,
  labels: { openTerminal: string; run: string },
) {
  const { openTerminal, run } = labels;
  const cardActions = useCallback(
    (item: KanbanItem) => (
      <MissionWorktreeCardAction
        item={item}
        labels={{ openTerminal, run }}
        onRun={onRun}
      />
    ),
    [onRun, openTerminal, run],
  );
  const panelActions = useCallback(
    (item: KanbanItem) => (
      <MissionWorktreePanelActions
        item={item}
        labels={{ openTerminal, run }}
        onRun={onRun}
      />
    ),
    [onRun, openTerminal, run],
  );
  return { cardActions, panelActions };
}
