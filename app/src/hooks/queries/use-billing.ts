import type { BillingSummary, OrgsList } from "@houston/engine-adapter";
import {
  activeOrg,
  activeOrgBilling,
  activeSpaceOrgSlug,
  planLaunchRefreshDelay,
} from "@houston/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { canReadTeamBillingSummary } from "../../lib/billing-gates";
import { reportError } from "../../lib/error-report";
import { hasSpaces } from "../../lib/org-roles";
import { refuseNativePurchase } from "../../lib/purchase-policy";
import { queryKeys } from "../../lib/query-keys";
import { isTeamWorkspace, orgSlugFromWorkspaceId } from "../../lib/space-id";
import { tauriOrg, tauriSystem } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useCapabilities } from "../use-capabilities";

export function useActiveOrgBilling() {
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const team = current ? orgSlugFromWorkspaceId(current.id) : null;
  const enabled = hasSpaces(capabilities) || capabilities?.plan === true;
  const orgs = useQuery<OrgsList>({
    queryKey: queryKeys.orgs(),
    queryFn: () => tauriOrg.listOrgs(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      planLaunchRefreshDelay(
        activeOrgBilling(team, query.state.data),
        Date.now(),
      ),
  });
  return {
    orgSlug: enabled ? activeSpaceOrgSlug(team, orgs.data) : null,
    billing: enabled ? activeOrgBilling(team, orgs.data) : null,
    upgradeOffer:
      enabled && activeOrgBilling(team, orgs.data)?.isBillingOwner === true,
    org: enabled ? (activeOrg(team, orgs.data) ?? null) : null,
    orgs: enabled ? orgs.data : undefined,
    isLoading: orgs.isLoading,
  };
}

export function useBilling() {
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const orgSlug = current ? orgSlugFromWorkspaceId(current.id) : null;
  const onTeam = current ? isTeamWorkspace(current.id) : false;
  const enabled =
    canReadTeamBillingSummary(capabilities, onTeam) && orgSlug !== null;
  return useQuery<BillingSummary | null>({
    queryKey: queryKeys.billing(orgSlug ?? ""),
    queryFn: () => tauriOrg.getBilling(),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function usePortal() {
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const portal = useMutation({
    mutationFn: async () =>
      refuseNativePurchase("billing_portal", reportError)
        ? null
        : tauriOrg.createPortal(),
    onMutate: () => setFallbackUrl(null),
    onSuccess: async (session) => {
      if (!session) return;
      const opened = await tauriSystem.openUrl(session.url, {
        command: "billing_portal_open",
      });
      setFallbackUrl(opened ? null : session.url);
    },
  });
  return { ...portal, fallbackUrl };
}

export function useClaimFreeSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriOrg.claimFreeSlot(),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orgs() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.billingChoice() }),
      ]),
  });
}
