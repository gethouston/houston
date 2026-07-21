import type { TriggerStatusItem, TriggerType } from "@houston-ai/engine-client";
import { useQuery } from "@tanstack/react-query";
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

/**
 * One agent's per-routine trigger status. `data` is `TriggerStatusItem[] | null`:
 * `null` means the host does not serve triggers (404) — the rows then render the
 * unknown state rather than nothing. Any other failure surfaces as a toast.
 *
 * `triggerRoutineIds` are the agent's trigger-bound routines; while any of them
 * is still settling (no status yet, `pending`, or `error`) the query polls on a
 * modest cadence and stops once they all settle. Enable it whenever the agent
 * has at least one trigger routine — independent of the `triggers` capability.
 */
export function useAgentTriggerStatus(
  agentId: string,
  enabled: boolean,
  triggerRoutineIds: string[],
) {
  const query = useQuery<TriggerStatusItem[] | null>({
    queryKey: ["agent-trigger-status", agentId],
    queryFn: () => getEngine().agentTriggerStatus(agentId),
    enabled,
    staleTime: 30_000,
    refetchInterval: (q) =>
      triggerStatusPollInterval(triggerRoutineIds, q.state.data),
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
