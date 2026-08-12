import type { SidebarLayout } from "@houston-ai/engine-client";
import { useCallback } from "react";
import { getCurrentAgentTeams } from "../../hooks/queries/use-agent-teams";
import {
  type UseSidebarLayout,
  useSidebarLayout,
} from "../../hooks/use-sidebar-layout";
import { normalizeTeamOverlay } from "../../lib/team-overlay";

/**
 * The workspace's sidebar layout, with the server-teams overlay rule applied.
 *
 * C13 rule 7, the overlay's decay rule. On a server host `sidebar_layout` is
 * an ordering OVERLAY keyed by SERVER team id, so what we PERSIST after every
 * write is pruned to the teams that still exist and the agents they still
 * hold: a team someone else deleted stops occupying the overlay instead of
 * piling up in it forever. The teams are read at WRITE time from the same
 * cache the rail renders, so the prune sees the freshest roster; before the
 * first read lands there is nothing to prune AGAINST, and pruning against
 * nothing would erase the user's whole drag order, so it passes through.
 * Off-capability no normalizer is passed at all: the stored layout is the
 * MODEL there, not an overlay, and it is written exactly as the op made it.
 */
export function useSidebarOverlayLayout(
  workspaceId: string | undefined,
  serverBacked: boolean,
): UseSidebarLayout {
  const normalizeOverlay = useCallback((next: SidebarLayout) => {
    const serverTeams = getCurrentAgentTeams();
    return serverTeams ? normalizeTeamOverlay(next, serverTeams) : next;
  }, []);
  return useSidebarLayout(
    workspaceId,
    serverBacked ? normalizeOverlay : undefined,
  );
}
