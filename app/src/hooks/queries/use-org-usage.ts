import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useAdminScreenActive } from "../use-admin-screen-active";

export const USAGE_DEFAULT_DAYS = 30;

export function useOrgUsage(
  enabled: boolean,
  days: number = USAGE_DEFAULT_DAYS,
) {
  const active = useAdminScreenActive();
  return useQuery({
    queryKey: queryKeys.orgUsage(days),
    queryFn: () => tauriOrg.usage(days),
    enabled: enabled && active,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
