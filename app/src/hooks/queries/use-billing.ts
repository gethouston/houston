import type { BillingSummary, OrgsList } from "@houston/engine-adapter";
import {
  activeOrgBilling,
  activeSpaceOrgSlug,
  planLaunchRefreshDelay,
} from "@houston/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
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

/**
 * C8 billing hooks for the active team space (`GET/POST /v1/org/billing*`).
 *
 * Reading is owner/admin-only and team-space-only: `useBilling` self-gates on
 * `caps.spaces` (the whole Spaces surface feature-detect), the active workspace
 * being a team (`org:*` id), AND the caller being owner/admin (`canSeeBilling`).
 * Off any of those — single-player, a personal space, or a plain member — the
 * query never fires. Every member reads the org's billing STATE (tier, pool,
 * routines, locks) off the orgs list instead (`useActiveOrgBilling`).
 *
 * No push on expiry — the effective `status` is a DERIVED read. So the client
 * re-reads on TWO triggers: entering a team space (the E3 space switch drops the
 * whole query cache via `resetCacheForSpaceChange`, so this refetches clean under
 * the new space — NOT duplicated here) and returning to the window
 * (`refetchOnWindowFocus`), which catches an expiry that elapsed while away.
 *
 * The wire calls route through `tauriOrg.*` → the engine adapter's `call()`
 * wrapper, which surfaces any failure once as a red bug toast + Sentry report
 * (the required no-silent-failures path). So these hooks carry no `onError` — a
 * second toast would double up (same as `use-orgs.ts` / `use-spaces.ts`).
 */

/**
 * The active org's billing (`OrgSummary.billing` off `GET /v1/orgs`): the one
 * org-plan contract the composer, the sidebar, the routine rules and the
 * shell's dialogs read. Every member can read it. `billing` is `undefined`
 * while the list loads and `null` for a legacy org or a deployment without
 * orgs. A deployment with per-person plans or spaces is a hosted gateway,
 * which lists the orgs; desktop and self-host have neither and never ask.
 *
 * It refetches on focus, and at the next instant the org's billing changes on
 * its own (the pool's weekly reset, a scheduled lock), on the shared orgs key.
 * `upgradeOffer` is whether the reader pays for this org, so upgrading it is
 * theirs to do.
 */
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
    isLoading: orgs.isLoading,
  };
}

/**
 * The active team's C8 billing summary, or `null` when off-entitlement (the
 * wire swallows the not-entitled 404/403 and the billing-off 503 → null).
 * Enabled only for an owner/admin on a team space of a Spaces-capable host,
 * and keyed by the active org it reads.
 *
 * There is no on-screen gate: the shell's team-status strip renders over EVERY
 * screen of a team space and holds this query hot for as long as the space is
 * open, so a second caller gating itself would only read the same cached
 * summary a moment later — a gate that buys nothing and reads as if it did.
 */
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

/**
 * Open the Stripe customer portal for the active org (billing owner only) in
 * the OS browser: card, invoices, a failed payment, cancel. `fallbackUrl` is
 * the link to offer when no browser opened. Portal failures surface via
 * `call()`. The store apps never open it (`refuseNativePurchase`), so the
 * mutation settles empty.
 */
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
