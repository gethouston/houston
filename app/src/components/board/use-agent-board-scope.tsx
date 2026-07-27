import type { KanbanItem } from "@houston-ai/board";
import { useMemo } from "react";
import { useSession } from "../../hooks/use-session";
import { missionMatchesScope } from "../../lib/agent-person-scope";
import { attachBoardPeople } from "../../lib/mission-people";
import { attachMissionUnread } from "../../lib/unread-model";
import { useAgentPersonScope } from "../agent-person-scope-context";
import { useAgentBoardPeople } from "./use-agent-board-people";
import { useAgentBoardUnread } from "./use-board-unread";

/**
 * Join the per-mission truth the activity list does not carry onto a single
 * agent's cards, then narrow them to the active PERSON SCOPE. Split out of
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
 *   {@link missionMatchesScope});
 * - joins the unread mark (HOU-945) on AFTER the filter, so a cursor moving
 *   re-maps only the cards that survived it, and never the whole activity list.
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
  const selfId = session?.uid ?? "";

  const peopleById = useAgentBoardPeople(path);
  // Join server-stamped attribution onto the activity-derived cards (which carry
  // none) so the bottom people strip and the person-scope roster can read it.
  // The card ICON stays the shared agent avatar on every board — contributors
  // live only in the strip. Identity pass-through off multiplayer (empty map).
  const peopledItems = useMemo(
    () => attachBoardPeople(items, peopleById),
    [items, peopleById],
  );
  const scopedItems = useMemo(
    () =>
      peopledItems.filter((i) => missionMatchesScope(i.people, scope, selfId)),
    [peopledItems, scope, selfId],
  );

  const unreadIds = useAgentBoardUnread(path);
  return useMemo(
    () => attachMissionUnread(scopedItems, unreadIds),
    [scopedItems, unreadIds],
  );
}
