import type { TriggerStatusItem, TriggerType } from "@houston/engine-adapter";
import { type Query, useQuery } from "@tanstack/react-query";
import { triggerStatusPollInterval } from "../../components/agent/routine-trigger-maps";
import { getEngine } from "../../lib/engine";
import i18n from "../../lib/i18n";
import { useQueryErrorToast } from "../use-query-error-toast.ts";

export function useTriggerTypes(toolkit: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: ["trigger-types", toolkit ?? ""],
    queryFn: () => getEngine().triggerTypes(toolkit as string),
    enabled: enabled && !!toolkit,
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

type AgentTriggerStatusData = TriggerStatusItem[] | null;

function agentTriggerStatusQueryKey(agentId: string): [string, string] {
  return ["agent-trigger-status", agentId];
}

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
