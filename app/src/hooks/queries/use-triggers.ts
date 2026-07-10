import type { TriggerStatusItem, TriggerType } from "@houston-ai/engine-client";
import { useQuery } from "@tanstack/react-query";
import { getEngine } from "../../lib/engine";
import i18n from "../../lib/i18n";
import { useQueryErrorToast } from "../use-query-error-toast.ts";

/**
 * The trigger surface's read queries (C9 event-driven routines). Both are gated
 * on the host-advertised `triggers` capability by the caller's `enabled` flag —
 * a deployment without triggers (desktop) never fetches. Reads call `getEngine()`
 * directly and surface a real failure as a toast (mirrors `useCapabilities`), so
 * a broken catalog is never swallowed.
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
 * `null` means the host does not serve triggers (404) — the caller then renders
 * no badges at all. Any other failure surfaces as a toast.
 */
export function useAgentTriggerStatus(agentId: string, enabled: boolean) {
  const query = useQuery<TriggerStatusItem[] | null>({
    queryKey: ["agent-trigger-status", agentId],
    queryFn: () => getEngine().agentTriggerStatus(agentId),
    enabled,
    staleTime: 30_000,
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
