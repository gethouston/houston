import type {
  AgentMoveStart,
  AgentMoveStatus,
  OrgsList,
} from "@houston-ai/engine-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { isExpectedShareError } from "../../lib/share-via-team";
import { tauriOrg } from "../../lib/tauri";

/**
 * C8 spaces read/move hooks for the share-via-team flow. Team creation lives in
 * `use-orgs.ts` (`useCreateTeam`); these cover LISTING the caller's spaces (to
 * pick a team to share into) and the agent MOVE + its poll.
 *
 * The wire calls route through `tauriOrg.*` → the engine client's `call()`
 * wrapper, which surfaces any failure as a red toast + Sentry report and
 * re-throws. So these hooks carry no `onError` (that would double-toast); a
 * caller that renders a failure inline reads the mutation/query error state.
 */

/**
 * The caller's spaces + pending invites (`GET /v1/orgs`). Degrades to an empty
 * result off-spaces (the wire swallows the 404), so a non-spaces host yields an
 * empty team list and the flow simply offers none. `enabled` gates the fetch so
 * it never fires on a host without the surface.
 */
export function useOrgs(enabled: boolean) {
  return useQuery<OrgsList>({
    queryKey: queryKeys.orgs(),
    queryFn: () => tauriOrg.listOrgs(),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Start an agent move into a team space (`POST /v1/agents/:slug/move`). Returns
 * the `{moveId}` ticket; the caller then polls {@link useAgentMoveStatus} to
 * terminal `done` BEFORE inviting (C8 share pipeline order is a contract rule).
 *
 * This hook is used ONLY by the share-via-team flow, which renders the C8 move
 * rejections (`unsupported_move` / `unmovable_volume` / `needs_upgrade`) inline
 * as a `MoveFailedStep`. So we `silence` those expected states from `call()`'s
 * generic red bug toast + Sentry report — the inline step is their sole surface.
 * Any OTHER move failure still toasts + captures.
 */
export function useMoveAgent() {
  return useMutation<
    AgentMoveStart,
    unknown,
    { agentSlugOrId: string; toSlug: string }
  >({
    mutationFn: ({ agentSlugOrId, toSlug }) =>
      tauriOrg.moveAgent(agentSlugOrId, toSlug, {
        silence: isExpectedShareError,
      }),
  });
}

/**
 * Poll one agent-move's progress. Enabled only while a move is in flight; stops
 * refetching once the status is terminal (`done`/`failed`) so a completed move
 * doesn't keep hitting the gateway. The move-completion signal is THIS route
 * only — never the agent event stream (which relays pod-scoped events).
 */
export function useAgentMoveStatus(
  agentSlugOrId: string,
  moveId: string | null,
  enabled: boolean,
) {
  return useQuery<AgentMoveStatus>({
    queryKey: queryKeys.agentMove(agentSlugOrId, moveId ?? ""),
    queryFn: () => tauriOrg.moveStatus(agentSlugOrId, moveId ?? ""),
    enabled: enabled && moveId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "done" || status === "failed" ? false : 1500;
    },
    // A move's state only ever moves forward; don't serve a stale terminal from
    // a prior move under the same key (the moveId in the key already scopes it).
    staleTime: 0,
    gcTime: 0,
  });
}
