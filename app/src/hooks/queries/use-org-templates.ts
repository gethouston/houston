import type { TemplateSpec } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

/**
 * The org's agent templates (Teams v2), newest first, as list-card summaries.
 *
 * Multiplayer-only and owner/admin-only: on a single-player/self-host host the
 * gateway 404s (the engine-client degrades that to `[]`), and the Templates tab
 * is never rendered anyway. The caller gates `enabled` on
 * `capabilities.multiplayer` + role. One org per user, so it's app-scoped.
 *
 * No `HoustonEvent` maps to template writes; the create/delete mutations below
 * invalidate this key directly, and a window-focus refetch covers a teammate's
 * change. Failures surface via the `tauriOrg.templates.*` → `call()` path
 * (toast + Report bug), so no `onError` is needed here.
 */
export function useOrgTemplates(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.orgTemplates(),
    queryFn: () => tauriOrg.templates.list(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * One template with its full `spec` (Teams v2), fetched lazily by id — only when
 * a caller actually needs the whole configuration (e.g. inspecting it), since
 * the create-from-template flow passes the id to the gateway rather than
 * shipping the spec back. Stays disabled until an `id` is chosen. A deleted or
 * unsupported template resolves to `null` (the engine-client swallows the 404).
 */
export function useOrgTemplate(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.orgTemplate(id ?? ""),
    queryFn: () => tauriOrg.templates.get(id as string),
    enabled: enabled && !!id,
    staleTime: 30_000,
  });
}

/**
 * The mutations below carry no `onError`: their `mutationFn` routes through the
 * `tauriOrg.templates.*` wrappers, each wrapped by the `call()` adapter in
 * `lib/tauri.ts`, which already surfaces the real error as a red toast AND
 * reports it to Sentry before re-throwing. Adding an `onError` would double-toast.
 */
export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      description: string;
      spec: TemplateSpec;
    }) => tauriOrg.templates.create(input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.orgTemplates() }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tauriOrg.templates.remove(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.orgTemplates() }),
  });
}
