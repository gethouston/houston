import type { OrgSettings } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

/**
 * Teams v2 only: the org-wide ceilings — the allowed-toolkit (app) ceiling and
 * the allowed-models (AI) ceiling every agent's effective set is derived under.
 * Readable by any member. Gated on the `teams` capability via `enabled`: a host
 * that predates Teams has no org-settings route, so the query stays idle there
 * and no degradation is needed. Feature detection is the `teams` flag, not a
 * swallowed error.
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

/**
 * Teams v2, owner only: replace the org-wide allowed-models ceiling
 * (`allowedModels`: `null` = every model allowed, `[]` = none) via the same
 * partial-patch `setOrgSettings` PUT. Optimistic whole-value swap with rollback,
 * mirroring {@link useSetOrgSettings} — but models carry no server-side grant
 * pruning, so this only invalidates the org settings and the `agent-settings`
 * prefix (an org models change narrows every agent's selectable model universe
 * via `orgAllowedModels`), never `agent-grants`. No `onError` toast: the
 * `tauriOrg.setSettings` wrapper routes through `call()`, which surfaces +
 * reports the failure once; `onError` here only rolls the optimistic value back.
 */
export function useSetOrgAllowedModels() {
  const qc = useQueryClient();
  const key = queryKeys.orgSettings();
  return useMutation({
    mutationFn: (allowedModels: string[] | null) =>
      tauriOrg.setSettings({ allowedModels }),
    onMutate: async (allowedModels) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<OrgSettings>(key);
      if (prev) {
        qc.setQueryData<OrgSettings>(key, { ...prev, allowedModels });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      // An org models change narrows every agent's selectable model universe;
      // refresh the agent-settings prefix so per-agent editors re-read it.
      qc.invalidateQueries({ queryKey: ["agent-settings"] });
    },
  });
}
