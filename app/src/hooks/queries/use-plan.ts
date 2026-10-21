import type { PlanRoutineKey } from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { reportError } from "../../lib/error-report";
import { refuseNativePurchase } from "../../lib/purchase-policy";
import { queryKeys } from "../../lib/query-keys";
import { refetchIfRoutineGone } from "../../lib/routine-gone-surface";
import { tauriOrg, tauriSystem } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";
import { useActiveOrgBilling } from "./use-billing";

/**
 * The per-person plan (`GET /v1/me/plan`): the Plan screen, the Plus offer and
 * the launch announcement. Usage and routine rules are the active org's
 * (`useActiveOrgBilling`).
 */
export function usePlan() {
  const { capabilities } = useCapabilities();
  return useQuery({
    queryKey: queryKeys.plan(),
    queryFn: tauriOrg.getPlan,
    enabled: capabilities?.plan === true,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useDismissPlanAnnouncement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: tauriOrg.dismissPlanAnnouncement,
    onSuccess: async () => {
      client.setQueryData(
        queryKeys.plan(),
        (plan: Awaited<ReturnType<typeof tauriOrg.getPlan>> | undefined) =>
          plan ? { ...plan, announcement: false } : plan,
      );
      await client.invalidateQueries({ queryKey: queryKeys.plan() });
    },
    onError: (error: unknown) =>
      reportError(
        "dismiss_plan_announcement",
        "Could not dismiss plan announcement",
        error,
      ),
  });
}

/** The active free org's routines, for the "choose a routine to keep" chooser. */
export function usePlanRoutines(enabled: boolean) {
  const { orgSlug } = useActiveOrgBilling();
  return useQuery({
    queryKey: queryKeys.planRoutines(orgSlug ?? ""),
    queryFn: tauriOrg.listPlanRoutines,
    enabled: enabled && orgSlug !== null,
  });
}

export function usePlusInvoices() {
  const { capabilities } = useCapabilities();
  return useQuery({
    queryKey: queryKeys.plusInvoices(),
    queryFn: tauriOrg.listPlusInvoices,
    enabled: capabilities?.plan === true,
  });
}

/**
 * Opens the Stripe customer portal. `fallbackUrl` is the link to offer when no
 * browser opened; failures are surfaced by the engine call itself. The store
 * apps never open it (`refuseNativePurchase`), so the mutation settles empty.
 */
export function usePlusPortal() {
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const portal = useMutation({
    mutationFn: async () =>
      refuseNativePurchase("plus_portal", reportError)
        ? null
        : tauriOrg.createPlusPortal(),
    onMutate: () => setFallbackUrl(null),
    onSuccess: async (session) => {
      if (!session) return;
      const { url } = session;
      const opened = await tauriSystem.openUrl(url, {
        command: "plus_portal_open",
      });
      setFallbackUrl(opened ? null : url);
    },
  });
  return { ...portal, fallbackUrl };
}

/**
 * Refetch what a routine choice changes: the org's billing and its routines,
 * and the plan the Plan screen still reads.
 */
function invalidateOrgRoutines(
  client: ReturnType<typeof useQueryClient>,
  orgSlug: string | null,
) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.orgs() }),
    client.invalidateQueries({ queryKey: queryKeys.plan() }),
    client.invalidateQueries({
      queryKey: queryKeys.planRoutines(orgSlug ?? ""),
    }),
  ]);
}

export function useKeepRoutine() {
  const client = useQueryClient();
  const { orgSlug } = useActiveOrgBilling();
  return useMutation({
    mutationFn: (key: PlanRoutineKey) => tauriOrg.keepRoutine(key),
    onSuccess: () => invalidateOrgRoutines(client, orgSlug),
    // The gateway's `routine_not_found`: the routine was deleted since the
    // list loaded, so refresh it (the toast is the quiet surface's).
    onError: (err) =>
      refetchIfRoutineGone(client, queryKeys.planRoutines(orgSlug ?? ""), err),
  });
}

export function useResumeRoutines() {
  const client = useQueryClient();
  const { orgSlug } = useActiveOrgBilling();
  return useMutation({
    mutationFn: tauriOrg.resumeRoutines,
    onSuccess: () => invalidateOrgRoutines(client, orgSlug),
  });
}
