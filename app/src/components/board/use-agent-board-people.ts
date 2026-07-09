import type { KanbanPerson } from "@houston-ai/board";
import { useMemo } from "react";
import { useConversations } from "../../hooks/queries";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { useCapabilities } from "../../hooks/use-capabilities";
import {
  buildBoardPeopleById,
  collectContributorIds,
} from "../../lib/mission-people";
import { isMultiplayer } from "../../lib/org-roles";

const EMPTY: ReadonlyMap<string, KanbanPerson[]> = new Map();

/**
 * Per-mission attribution for ONE agent's board, keyed by mission id. Mirrors
 * the cross-agent Mission Control attribution block ({@link useMissionControl}):
 * resolve every contributor on the agent's conversations to a display profile,
 * then fold them into face stacks. Multiplayer (hosted Teams) only — the
 * conversations query, the profiles lookup, and the fold are all gated so
 * single-player / desktop runs neither request and gets an empty map (the board
 * stays byte-identical, no `people` on any card). The activity list the board
 * renders from carries no attribution, so the caller joins these on by id.
 */
export function useAgentBoardPeople(
  agentPath: string,
): ReadonlyMap<string, KanbanPerson[]> {
  const { capabilities } = useCapabilities();
  const multiplayer = isMultiplayer(capabilities);
  const { data: convos } = useConversations(
    multiplayer ? agentPath : undefined,
  );
  const contributorIds = useMemo(
    () => (multiplayer && convos ? collectContributorIds(convos) : []),
    [multiplayer, convos],
  );
  const { profiles } = useUserProfiles(contributorIds);

  return useMemo(
    () =>
      multiplayer && convos ? buildBoardPeopleById(convos, profiles) : EMPTY,
    [multiplayer, convos, profiles],
  );
}
