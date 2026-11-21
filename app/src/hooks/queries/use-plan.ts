import type { PlanRoutineKey } from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { refetchIfRoutineGone } from "../../lib/routine-gone-surface";
import { tauriOrg } from "../../lib/tauri";
import { useActiveOrgBilling } from "./use-billing";

export function usePlanRoutines(enabled: boolean) {
  const { orgSlug } = useActiveOrgBilling();
  return useQuery({
    queryKey: queryKeys.planRoutines(orgSlug ?? ""),
    queryFn: tauriOrg.listPlanRoutines,
    enabled: enabled && orgSlug !== null,
  });
}

function invalidateOrgRoutines(
  client: ReturnType<typeof useQueryClient>,
  orgSlug: string | null,
) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.orgs() }),
    client.invalidateQueries({
      queryKey: queryKeys.planRoutines(orgSlug ?? ""),
    }),
  ]);
}

export function useKeepRoutine() {
  const client = useQueryClient();
  const { orgSlug } = useActiveOrgBilling();
  return useMutation({
    mutationFn: (key: PlanRoutineKey) => tauriOrg.keepRoutine(key),
    onSuccess: () => invalidateOrgRoutines(client, orgSlug),
    onError: (err) =>
      refetchIfRoutineGone(client, queryKeys.planRoutines(orgSlug ?? ""), err),
  });
}

export function useResumeRoutines() {
  const client = useQueryClient();
  const { orgSlug } = useActiveOrgBilling();
  return useMutation({
    mutationFn: tauriOrg.resumeRoutines,
    onSuccess: () => invalidateOrgRoutines(client, orgSlug),
  });
}
