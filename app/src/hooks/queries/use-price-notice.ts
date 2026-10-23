import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

/**
 * The promo-ended notice's two answers for the active org's billing owner.
 * Both refetch the orgs list once settled, so the org's billing (its
 * interval, its next charge, the notice itself) is the gateway's again. No
 * `onError`: the engine call already surfaced and reported a failure, and the
 * owner's states (a declined card) come back as outcomes.
 */
export function useSwitchToYearly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriOrg.switchToYearly(),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.orgs() }),
  });
}

export function useDismissPriceNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriOrg.dismissPriceNotice(),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.orgs() }),
  });
}
