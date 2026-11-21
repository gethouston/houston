import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

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
