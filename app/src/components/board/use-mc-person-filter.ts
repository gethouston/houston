import type { KanbanItem } from "@houston-ai/board";
import { useMemo, useState } from "react";
import { missionMatchesPerson } from "../../lib/mission-people";

/**
 * The board's person filter. It runs AFTER the agent filter and BEFORE text
 * search: narrow to the missions the chosen person is on, `null` (Everyone)
 * being a no-op. The filter menu's roster stays keyed off the agent-filtered
 * items, so every person is always reselectable whatever the person filter.
 */
export function useMcPersonFilter(agentFilteredItems: KanbanItem[]) {
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const personFilteredItems = useMemo(
    () =>
      filterUserId
        ? agentFilteredItems.filter((i) =>
            missionMatchesPerson(i.people, filterUserId),
          )
        : agentFilteredItems,
    [agentFilteredItems, filterUserId],
  );
  return { filterUserId, setFilterUserId, personFilteredItems };
}
