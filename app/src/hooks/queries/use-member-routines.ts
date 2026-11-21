import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

export function useMemberRoutines(userId: string | null, open: boolean) {
  return useQuery({
    queryKey: queryKeys.memberRoutines(userId ?? ""),
    queryFn: () => tauriOrg.memberRoutines(userId ?? ""),
    enabled: open && userId !== null,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
