import type { KanbanItem } from "@houston-ai/board";
import { useMemo } from "react";
import { useSession } from "../../hooks/use-session";
import { missionMatchesScope } from "../../lib/agent-person-scope";
import { attachBoardPeople } from "../../lib/mission-people";
import { useAgentPersonScope } from "../agent-person-scope-context";
import { useAgentBoardPeople } from "./use-agent-board-people";

/**
 * Join the per-mission truth the activity list does not carry onto a single
 * agent's cards, then narrow them to the active PERSON SCOPE. Split out of
 * {@link useAgentBoardSource} so the source stays a thin composition. The scope
 * itself is chosen in the agent header ({@link AgentPersonScopeMenu}) and shared
 * via {@link useAgentPersonScope}; this only applies it to the cards:
 *
 * - joins server-stamped attribution onto the activity-derived cards (which
 *   carry none) by mission id, multiplayer-gated so desktop stays identical
 *   (the default "everyone" scope matches every card, and off multiplayer the
 *   empty attribution map keeps narrower scopes an identity pass-through);
 * - filters BEFORE text search, exactly as the cross-agent board;
 * - defaults to "everyone"; a user narrowing to "me" still sees unattributed /
 *   legacy missions (see {@link missionMatchesScope}).
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
  return useMemo(
    () =>
      peopledItems.filter((i) => missionMatchesScope(i.people, scope, selfId)),
    [peopledItems, scope, selfId],
  );
}
