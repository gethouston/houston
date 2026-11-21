import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useAdminScreenActive } from "../use-admin-screen-active";

export const COMPUTE_USAGE_DAYS = 30;

export function useComputeUsage(enabled: boolean) {
  const active = useAdminScreenActive();
  return useQuery({
    queryKey: queryKeys.computeUsage(COMPUTE_USAGE_DAYS),
    queryFn: () => tauriOrg.computeUsage(COMPUTE_USAGE_DAYS),
    enabled: enabled && active,
    staleTime: 20_000,
    refetchInterval: (query) =>
      (query.state.data?.awakeNow.length ?? 0) > 0 ? 30_000 : 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
