import type { PlanRoutineKey } from "@houston/engine-adapter";
import { planLaunchRefreshDelay } from "@houston/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { reportError } from "../../lib/error-report";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg, tauriSystem } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";

export function usePlan() {
  const { capabilities } = useCapabilities();
  return useQuery({
    queryKey: queryKeys.plan(),
    queryFn: tauriOrg.getPlan,
    enabled: capabilities?.plan === true,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      planLaunchRefreshDelay(query.state.data, Date.now()),
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

export function usePlanRoutines(enabled: boolean) {
  const { capabilities } = useCapabilities();
  return useQuery({
    queryKey: queryKeys.planRoutines(),
    queryFn: tauriOrg.listPlanRoutines,
    enabled: enabled && capabilities?.plan === true,
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
 * browser opened; failures are surfaced by the engine call itself.
 */
export function usePlusPortal() {
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const portal = useMutation({
    mutationFn: tauriOrg.createPlusPortal,
    onMutate: () => setFallbackUrl(null),
    onSuccess: async ({ url }) => {
      const opened = await tauriSystem.openUrl(url, {
        command: "plus_portal_open",
      });
      setFallbackUrl(opened ? null : url);
    },
  });
  return { ...portal, fallbackUrl };
}

export function useKeepRoutine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (key: PlanRoutineKey) => tauriOrg.keepRoutine(key),
    onSuccess: async (plan) => {
      client.setQueryData(queryKeys.plan(), plan);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.plan() }),
        client.invalidateQueries({ queryKey: queryKeys.planRoutines() }),
      ]);
    },
  });
}

export function useResumeRoutines() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: tauriOrg.resumeRoutines,
    onSuccess: async (plan) => {
      client.setQueryData(queryKeys.plan(), plan);
      await client.invalidateQueries({ queryKey: queryKeys.plan() });
    },
  });
}
