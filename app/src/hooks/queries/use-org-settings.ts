import type { OrgSettings } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

/**
 * Teams v2 only: the org-wide allowed-toolkit ceiling — the integration policy
 * every agent's effective allowlist is derived under. Readable by any member.
 * Gated on the `teams` capability via `enabled`: a host that predates Teams has
 * no org-settings route, so the query stays idle there and no degradation is
 * needed. Feature detection is the `teams` flag, not a swallowed error.
 */
export function useOrgSettings(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.orgSettings(),
    queryFn: () => tauriOrg.getSettings(),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Teams v2, owner only: replace the org-wide allowed-toolkit ceiling (`null` =
 * all allowed, `[]` = none). Optimistic — a single owner action, so a
 * whole-value swap with rollback on error is enough. An org ceiling change
 * re-derives every agent's effective allowlist and may prune grants server-side,
 * so this invalidates the org settings AND the `agent-settings` / `agent-grants`
 * prefixes so those refresh without a remount. Carries no `onError` toast: the
 * `tauriOrg.*` wrappers route through `call()`, which surfaces + reports the
 * failure once (adding one here would double-toast); the `onError` below only
 * rolls the optimistic value back.
 */
export function useSetOrgSettings() {
  const qc = useQueryClient();
  const key = queryKeys.orgSettings();
  return useMutation({
    mutationFn: (allowedToolkits: string[] | null) =>
      tauriOrg.setSettings({ allowedToolkits }),
    onMutate: async (allowedToolkits) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<OrgSettings>(key);
      if (prev) {
        qc.setQueryData<OrgSettings>(key, { ...prev, allowedToolkits });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      // An org ceiling change re-derives every agent's effective allowlist and
      // may prune grants server-side; refresh both prefixes so the change shows
      // without a remount.
      qc.invalidateQueries({ queryKey: ["agent-settings"] });
      qc.invalidateQueries({ queryKey: ["agent-grants"] });
    },
  });
}
