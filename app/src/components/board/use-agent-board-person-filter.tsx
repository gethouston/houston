import type { KanbanItem } from "@houston-ai/board";
import { type ReactNode, useMemo, useState } from "react";
import {
  attachBoardPeople,
  missionMatchesPerson,
} from "../../lib/mission-people";
import { reconcileBoardFilterUserId } from "./agent-board-person-filter-model";
import { AgentBoardToolbar } from "./agent-board-toolbar";
import { useAgentBoardPeople } from "./use-agent-board-people";

/**
 * The filter-by-person concern for a single agent's board, split out of
 * {@link useAgentBoardSource} so the source stays a thin composition. Same
 * three-state control + semantics as the cross-agent board (Everyone / My
 * missions / each teammate on THIS agent's missions):
 *
 * - joins server-stamped attribution onto the activity-derived cards (which
 *   carry none) by mission id, multiplayer-gated so desktop stays identical;
 * - narrows the board to the selected person BEFORE text search, `null`
 *   (Everyone) a no-op, unattributed missions matching Everyone only;
 * - hands back the toolbar that renders the filter menu (self-hiding off
 *   spaces / single-player, so no empty strip above the board).
 */
export function useAgentBoardPersonFilter({
  path,
  items,
  collapsed,
}: {
  path: string;
  /** Active missions from the activity list, before attribution / filtering. */
  items: KanbanItem[];
  collapsed: boolean;
}): { items: KanbanItem[]; toolbar: ReactNode } {
  const [filterUserId, setFilterUserId] = useState<string | null>(null);

  // `filterUserId` is per-agent, but this board tab is reused across agents
  // (keyed by tab, not agent). Reconcile the selection during render on agent
  // switch so a teammate chosen for the previous agent can't strand the new
  // agent's board on an empty filtered view. `reconciledUserId` is the single
  // source of truth for THIS frame — it's persisted to state AND used for the
  // filter below, so the reset lands before the filtered board commits (no
  // one-frame empty flash). See {@link reconcileBoardFilterUserId}.
  const [trackedPath, setTrackedPath] = useState(path);
  const reconciledUserId = reconcileBoardFilterUserId({
    trackedPath,
    path,
    filterUserId,
  });
  if (trackedPath !== path) {
    setTrackedPath(path);
    setFilterUserId(reconciledUserId);
  }

  const peopleById = useAgentBoardPeople(path);
  const peopledItems = useMemo(
    () => attachBoardPeople(items, peopleById),
    [items, peopleById],
  );
  // The filter menu's roster stays keyed off `peopledItems` (pre-filter) so
  // every person is always reselectable regardless of the active selection.
  const filteredItems = useMemo(
    () =>
      reconciledUserId
        ? peopledItems.filter((i) =>
            missionMatchesPerson(i.people, reconciledUserId),
          )
        : peopledItems,
    [peopledItems, reconciledUserId],
  );

  const toolbar = (
    <AgentBoardToolbar
      items={peopledItems}
      filterUserId={reconciledUserId}
      onFilterUserIdChange={setFilterUserId}
      collapsed={collapsed}
    />
  );

  return { items: filteredItems, toolbar };
}
