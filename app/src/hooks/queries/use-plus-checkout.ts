import type { OrgsList } from "@houston/engine-adapter";
import { billingCheckoutOutstanding, plusCheckoutOrgSlug } from "@houston/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { logAndReportError, reportError } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import i18n from "../../lib/i18n";
import { osFocusWindow } from "../../lib/os-bridge";
import { billingCheckout as tracker } from "../../lib/plan-session";
import { surfacePlusCheckoutFailure } from "../../lib/plus-checkout-failure";
import { refuseNativePurchase } from "../../lib/purchase-policy";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg, tauriSystem } from "../../lib/tauri";

const CHECKOUT_POLL_MS = 5_000;

function useCheckoutState() {
  return useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
}

/**
 * A Plus checkout's view: `start` opens Stripe unless a checkout is already
 * outstanding (`outstanding` disables every trigger meanwhile), `fallbackUrl`
 * is the link to offer when no browser opened, `succeeded` confirms the
 * upgrade this app started. A Plus subscription pays for the person's own
 * (personal) org, so the checkout is tracked on that org until it is paid
 * up. The store apps never open Stripe (`refuseNativePurchase`).
 */
export function usePlusCheckout() {
  const queryClient = useQueryClient();
  const state = useCheckoutState();
  const start = useCallback(() => {
    if (refuseNativePurchase("plus_checkout", reportError)) return;
    const refresh = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plan() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orgs() }),
      ]);
    void queryClient
      .ensureQueryData<OrgsList>({
        queryKey: queryKeys.orgs(),
        queryFn: () => tauriOrg.listOrgs(),
      })
      .then((orgs) => {
        const orgSlug = plusCheckoutOrgSlug(orgs);
        if (!orgSlug) throw new Error("No personal org to check out for");
        return tracker.start(orgSlug, {
          create: tauriOrg.createPlusCheckout,
          open: (url) =>
            tauriSystem.openUrl(url, { command: "plus_checkout_open" }),
        });
      })
      .then((started) => (started ? refresh() : undefined))
      .catch((error: unknown) =>
        surfacePlusCheckoutFailure(error, {
          invalidatePlan: () => void refresh(),
          showExpected: (title, body) =>
            showExpectedStateToast(i18n.t(title), i18n.t(body)),
          report: (failure) => logAndReportError("plus_checkout", failure),
        }),
      );
  }, [queryClient]);
  return {
    start,
    outstanding: billingCheckoutOutstanding(state),
    fallbackUrl: state.phase === "open" ? state.fallbackUrl : null,
    succeeded: state.phase === "succeeded",
  };
}

/**
 * Polls the orgs list while a checkout is open and brings the desktop window
 * forward (and refreshes the plan) once its org is paid up. Mounted once, by
 * the shell's plan lifecycle, so the watch outlives whichever dialog or card
 * started it.
 */
export function usePlusCheckoutWatcher() {
  const queryClient = useQueryClient();
  const polling = useCheckoutState().phase === "open";
  const orgs = useQuery<OrgsList>({
    queryKey: queryKeys.orgs(),
    queryFn: () => tauriOrg.listOrgs(),
    enabled: polling,
    refetchInterval: polling ? CHECKOUT_POLL_MS : false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!tracker.observe(orgs.data)) return;
    // The Plan screen still reads the per-person plan, which the poll skips.
    void queryClient.invalidateQueries({ queryKey: queryKeys.plan() });
    void osFocusWindow().catch((error: unknown) =>
      reportError(
        "plus_checkout_focus",
        "Could not focus after checkout",
        error,
      ),
    );
  }, [orgs.data, queryClient]);
}
