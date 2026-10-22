import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

/**
 * The routines removing `userId` would stop, for the remove confirmation
 * (owner only, like the removal).
 *
 * Read fresh on every open (a teammate may have just set one up) and
 * refreshed by `RoutinesChanged` while it stays open, never on window focus
 * (a failing read would report again on every focus). A failure is reported
 * through `tauriOrg.memberRoutines` → `call()` and shows the user nothing
 * beyond the dialog's own neutral note: the removal itself still works.
 * `open` false keeps the last answer on screen while the dialog fades out.
 */
export function useMemberRoutines(userId: string | null, open: boolean) {
  return useQuery({
    queryKey: queryKeys.memberRoutines(userId ?? ""),
    queryFn: () => tauriOrg.memberRoutines(userId ?? ""),
    enabled: open && userId !== null,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
