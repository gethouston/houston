import type { KanbanItem } from "@houston-ai/board";
import { useMemo, useState } from "react";
import { missionMatchesPerson } from "../../lib/mission-people";

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
