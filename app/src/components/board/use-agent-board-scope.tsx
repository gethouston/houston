import type { KanbanItem } from "@houston-ai/board";
import { useMemo } from "react";
import { useSession } from "../../hooks/use-session";
import { missionMatchesScope } from "../../lib/agent-person-scope";
import { attachBoardPeople, iconPersonFor } from "../../lib/mission-people";
import { useAgentPersonScope } from "../agent-person-scope-context";
import { AgentCardPersonIcon } from "./agent-card-person-icon";
import { useAgentBoardPeople } from "./use-agent-board-people";

/**
 * Narrow a single agent's board to the active PERSON SCOPE, split out of
 * {@link useAgentBoardSource} so the source stays a thin composition. The scope
 * itself is chosen in the agent header ({@link AgentPersonScopeMenu}) and shared
 * via {@link useAgentPersonScope}; this only applies it to the cards:
 *
 * - joins server-stamped attribution onto the activity-derived cards (which
 *   carry none) by mission id, multiplayer-gated so desktop stays identical (an
 *   empty map means every item passes as unattributed → the default "me" scope
 *   is an identity pass-through off multiplayer);
 * - filters BEFORE text search, exactly as the cross-agent board;
 * - defaults to "me", which keeps unattributed / legacy missions visible (see
 *   {@link missionMatchesScope}).
 */
export function useAgentBoardScope({
  path,
  items,
}: {
  path: string;
  /** Active missions from the activity list, before attribution / filtering. */
  items: KanbanItem[];
}): KanbanItem[] {
  const { scope } = useAgentPersonScope();
  const { data: session } = useSession();
  const selfId = session?.user?.id ?? "";

  const peopleById = useAgentBoardPeople(path);
  const peopledItems = useMemo(() => {
    const withPeople = attachBoardPeople(items, peopleById);
    // Single-player / desktop resolves no attribution, so leave `icon` unset and
    // let the board-wide agent avatar show (identity pass-through, no churn).
    if (peopleById.size === 0) return withPeople;
    // Multiplayer: swap the card icon for the mission's working person's face,
    // falling back to the agent avatar when a mission has no attribution.
    return withPeople.map((item) => {
      const person = iconPersonFor(item.people);
      if (!person) return item;
      return {
        ...item,
        icon: (
          <AgentCardPersonIcon
            person={person}
            running={item.status === "running"}
          />
        ),
      };
    });
  }, [items, peopleById]);
  return useMemo(
    () =>
      peopledItems.filter((i) => missionMatchesScope(i.people, scope, selfId)),
    [peopledItems, scope, selfId],
  );
}
