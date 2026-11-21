import { useInfiniteQuery } from "@tanstack/react-query";
import {
  AUDIT_PAGE_SIZE,
  nextAuditCursor,
} from "../../components/organization/org-view-model";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useAdminScreenActive } from "../use-admin-screen-active";

export function useOrgAudit(enabled: boolean) {
  const active = useAdminScreenActive();
  return useInfiniteQuery({
    queryKey: queryKeys.orgAudit(),
    queryFn: ({ pageParam }: { pageParam: number | undefined }) =>
      tauriOrg.audit({ before: pageParam, limit: AUDIT_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextAuditCursor,
    enabled: enabled && active,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
