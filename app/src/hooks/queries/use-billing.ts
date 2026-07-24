import type { BillingSummary } from "@houston-ai/engine-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { canSeeBillingTab } from "../../lib/org-roles";
import { queryKeys } from "../../lib/query-keys";
import { isTeamWorkspace } from "../../lib/space-id";
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
 * query never fires and nothing renders; a member reads the degrade state from
 * `OrgSummary.degraded` instead (C8 §Client UX: members NEVER see billing data).
 *
 * No push on expiry — the effective `status` is a DERIVED read. So the client
 * re-reads on TWO triggers: entering a team space (the E3 space switch drops the
 * whole query cache via `resetCacheForSpaceChange`, so this refetches clean under
 * the new space — NOT duplicated here) and returning to the window
 * (`refetchOnWindowFocus`), which catches an expiry that elapsed while away.
 *
 * The wire calls route through `tauriOrg.*` → the engine client's `call()`
 * wrapper, which surfaces any failure once as a red bug toast + Sentry report
 * (the required no-silent-failures path). So these hooks carry no `onError` — a
 * second toast would double up (same as `use-orgs.ts` / `use-spaces.ts`).
 */

/**
 * The active team's billing summary, or `null` when off-entitlement (the wire
 * swallows the not-entitled 404/403 and the billing-off 503 → null). Enabled
 * only for an owner/admin on a team space of a Spaces-capable host.
 */
export function useBilling() {
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const onTeam = current ? isTeamWorkspace(current.id) : false;
  const enabled = canSeeBillingTab(capabilities, onTeam);
  return useQuery<BillingSummary | null>({
    queryKey: queryKeys.billing(),
    queryFn: () => tauriOrg.getBilling(),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/**
 * Start a Stripe Checkout session for the active team (owner only) and open the
 * returned hosted URL in the OS browser (the app's external-open convention,
 * `tauriSystem.openUrl`). Checkout failures surface via `call()`.
 */
export function useCheckout() {
  return useMutation({
    mutationFn: (interval: "monthly" | "annual") =>
      tauriOrg.createCheckout(interval),
    onSuccess: ({ url }) => {
      tauriSystem.openUrl(url);
    },
  });
}

/**
 * Open the Stripe customer portal for the active team (owner only) in the OS
 * browser — card, invoices, interval switch, cancel. Portal failures surface
 * via `call()`.
 */
export function usePortal() {
  return useMutation({
    mutationFn: () => tauriOrg.createPortal(),
    onSuccess: ({ url }) => {
      tauriSystem.openUrl(url);
    },
  });
}
