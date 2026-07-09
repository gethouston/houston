import type { KanbanItem } from "@houston-ai/board";
import { MissionPersonFilter } from "../mission-person-filter";
import { usePersonFilterMode } from "../use-person-filter-mode";

interface AgentBoardToolbarProps {
  /** Active missions for THIS agent (already carry `people` in multiplayer) —
   *  the roster the filter menu offers. */
  items: KanbanItem[];
  filterUserId: string | null;
  onFilterUserIdChange: (userId: string | null) => void;
  /** Compact layout: a chat panel is open, so the board is narrow. */
  collapsed: boolean;
}

/**
 * The controls row above a single agent's board. Today it holds one control:
 * the filter-by-person menu (search lives in the agent header). It shares the
 * board's exact gate via {@link usePersonFilterMode} so it renders NOTHING off
 * spaces / single-player / signed out — no empty padded strip above the board
 * where the filter would be. The mission search for this surface stays in the
 * shell header; this is purely the attribution filter.
 */
export function AgentBoardToolbar({
  items,
  filterUserId,
  onFilterUserIdChange,
  collapsed,
}: AgentBoardToolbarProps) {
  const { mode } = usePersonFilterMode();
  if (mode === "hidden") return null;

  return (
    <div className="flex shrink-0 items-center justify-end px-5 pt-4">
      <MissionPersonFilter
        items={items}
        filterUserId={filterUserId}
        onFilterUserIdChange={onFilterUserIdChange}
        collapsed={collapsed}
      />
    </div>
  );
}
