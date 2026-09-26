import { plusCheckoutOutstanding } from "@houston/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { logAndReportError, reportError } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import i18n from "../../lib/i18n";
import { osFocusWindow } from "../../lib/os-bridge";
import { plusCheckout as tracker } from "../../lib/plan-session";
import { surfacePlusCheckoutFailure } from "../../lib/plus-checkout-failure";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg, tauriSystem } from "../../lib/tauri";

const CHECKOUT_POLL_MS = 5_000;

function useCheckoutState() {
  return useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
}

/**
 * A checkout trigger's view: `start` opens Stripe unless a checkout is already
 * outstanding (`outstanding` disables every trigger meanwhile), `fallbackUrl`
 * is the link to offer when no browser opened, `succeeded` confirms the
 * upgrade this app started.
 */
export function usePlusCheckout() {
  const queryClient = useQueryClient();
  const state = useCheckoutState();
  const start = useCallback(() => {
    void tracker
      .start({
        create: tauriOrg.createPlusCheckout,
        open: (url) =>
          tauriSystem.openUrl(url, { command: "plus_checkout_open" }),
      })
      .then((started) =>
        started
          ? queryClient.invalidateQueries({ queryKey: queryKeys.plan() })
          : undefined,
      )
      .catch((error: unknown) =>
        surfacePlusCheckoutFailure(error, {
          invalidatePlan: () =>
            void queryClient.invalidateQueries({ queryKey: queryKeys.plan() }),
          showExpected: (title, body) =>
            showExpectedStateToast(i18n.t(title), i18n.t(body)),
          report: (failure) => logAndReportError("plus_checkout", failure),
        }),
      );
  }, [queryClient]);
  return {
    start,
    outstanding: plusCheckoutOutstanding(state),
    fallbackUrl: state.phase === "open" ? state.fallbackUrl : null,
    succeeded: state.phase === "succeeded",
  };
}

/**
 * Polls the plan while a checkout is open and brings the desktop window
 * forward once it turns Plus. Mounted once, by the shell's plan lifecycle, so
 * the watch outlives whichever dialog or card started the checkout.
 */
export function usePlusCheckoutWatcher() {
  const polling = useCheckoutState().phase === "open";
  const plan = useQuery({
    queryKey: queryKeys.plan(),
    queryFn: tauriOrg.getPlan,
    enabled: polling,
    refetchInterval: polling ? CHECKOUT_POLL_MS : false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!tracker.observe(plan.data)) return;
    void osFocusWindow().catch((error: unknown) =>
      reportError(
        "plus_checkout_focus",
        "Could not focus after checkout",
        error,
      ),
    );
  }, [plan.data]);
}
