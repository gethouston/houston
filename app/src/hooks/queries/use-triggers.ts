import type { TriggerStatusItem, TriggerType } from "@houston-ai/engine-client";
import { type Query, useQuery } from "@tanstack/react-query";
import { triggerStatusPollInterval } from "../../components/tabs/routine-trigger-maps";
import { getEngine } from "../../lib/engine";
import i18n from "../../lib/i18n";
import { useQueryErrorToast } from "../use-query-error-toast.ts";

/**
 * The trigger surface's read queries (C9 event-driven routines). The trigger
 * CATALOG is gated on the host-advertised `triggers` capability (offering an
 * event trigger needs a live backend). Trigger STATUS is NOT: any agent that
 * already has a trigger-bound routine must show that routine's health, even on a
 * host that cannot fire it — an older host 404s, the client returns `null`, and
 * the rows fall back to the unknown state. Reads call `getEngine()` directly and
 * surface a real failure as a toast (mirrors `useCapabilities`), so a broken
 * catalog is never swallowed.
 */

/** One toolkit's trigger catalog — the events a routine can wake on. */
export function useTriggerTypes(toolkit: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: ["trigger-types", toolkit ?? ""],
    queryFn: () => getEngine().triggerTypes(toolkit as string),
    enabled: enabled && !!toolkit,
    // The catalog is large and near-static, so cache it for the session.
    staleTime: 60 * 60 * 1000,
  });
  useQueryErrorToast(
    query.isError,
    query.error,
    "trigger_types_fetch",
    i18n.t("routines:trigger.loadFailed"),
  );
  return query;
}

/** What the trigger-status route answers: `null` = this host serves no triggers. */
type AgentTriggerStatusData = TriggerStatusItem[] | null;

/** ONE agent's trigger-status cache entry. Named so a cross-agent retry can
 *  target exactly the agents that failed without rebuilding their options. */
export function agentTriggerStatusQueryKey(agentId: string): [string, string] {
  return ["agent-trigger-status", agentId];
}

/**
 * ONE agent's trigger status, as options. The per-agent Automations tab
 * (`useAgentTriggerStatus`) and the team's cross-agent list (a `useQueries`
 * fan-out over the team's agents) both build from this, so they share the key,
 * the cache entry, the queryFn and the poll cadence — the same reasoning as
 * `routinesQueryOptions`. An aggregate key would be a second source of the same
 * truth, and the two surfaces could then disagree about whether a trigger is
 * alive.
 *
 * `triggerRoutineIds` are the agent's OWN trigger-bound routine ids: while any
 * of them is still settling (no status yet, `pending`, or `error`) the query
 * polls on a modest cadence and stops once they all settle. Callers enable it
 * only when that list is non-empty, so an agent with no event routine is never
 * asked.
 */
export function agentTriggerStatusQueryOptions(
  agentId: string,
  triggerRoutineIds: string[],
) {
  return {
    queryKey: agentTriggerStatusQueryKey(agentId),
    queryFn: (): Promise<AgentTriggerStatusData> =>
      getEngine().agentTriggerStatus(agentId),
    staleTime: 30_000,
    refetchInterval: (q: Query<AgentTriggerStatusData>) =>
      triggerStatusPollInterval(triggerRoutineIds, q.state.data),
  };
}

/**
 * One agent's per-routine trigger status. `data` is `TriggerStatusItem[] | null`:
 * `null` means the host does not serve triggers (404) — the rows then render the
 * unknown state rather than nothing. Any other failure surfaces as a toast.
 *
 * Enable it whenever the agent has at least one trigger routine — independent of
 * the `triggers` capability. The toast is this hook's own, NOT the shared
 * options': a fan-out over a team's agents reuses the options and would
 * otherwise fire one toast per unreachable agent.
 */
export function useAgentTriggerStatus(
  agentId: string,
  enabled: boolean,
  triggerRoutineIds: string[],
) {
  const query = useQuery<AgentTriggerStatusData>({
    ...agentTriggerStatusQueryOptions(agentId, triggerRoutineIds),
    enabled,
  });
  useQueryErrorToast(
    query.isError,
    query.error,
    "trigger_status_fetch",
    i18n.t("routines:trigger.loadFailed"),
  );
  return query;
}

export type { TriggerStatusItem, TriggerType };
