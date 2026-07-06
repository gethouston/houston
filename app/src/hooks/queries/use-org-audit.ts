import { useInfiniteQuery } from "@tanstack/react-query";
import {
  AUDIT_PAGE_SIZE,
  nextAuditCursor,
} from "../../components/organization/org-view-model";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

/**
 * The org audit feed (Teams v2), newest first, paged by a before-cursor.
 *
 * Multiplayer-only and owner/admin-only: on a plain-member or single-player
 * host the gateway 403s (or `getOrg`'s absence means the Organization view is
 * never rendered), so the caller gates `enabled` on `capabilities.multiplayer`
 * + role. Each page is an `AuditEntry[]`; the next page starts before the last
 * entry's id, and paging stops once a short page proves the tail was reached.
 *
 * No `HoustonEvent` maps to audit writes (they're fire-and-forget server-side),
 * so there's nothing to invalidate on — a window-focus refetch keeps the feed
 * reasonably fresh without a firehose subscription. Failures surface via the
 * `tauriOrg.audit` → `call()` path (toast + Report bug), no `onError` needed.
 */
export function useOrgAudit(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.orgAudit(),
    queryFn: ({ pageParam }: { pageParam: number | undefined }) =>
      tauriOrg.audit({ before: pageParam, limit: AUDIT_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextAuditCursor,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
