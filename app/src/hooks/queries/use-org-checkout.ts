import type { OrgsList } from "@houston/engine-adapter";
import { billingCheckoutOutstanding } from "@houston/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { type ReservedTab, reserveBrowserTab } from "../../lib/browser-tab";
import { logAndReportError, reportError } from "../../lib/error-report";
import { runOrgCheckout } from "../../lib/org-checkout-run";
import { osFocusWindow } from "../../lib/os-bridge";
import { osIsTauri } from "../../lib/os-bridge/platform";
import { billingCheckout as tracker } from "../../lib/plan-session";
import { refuseNativePurchase } from "../../lib/purchase-policy";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg, tauriSystem } from "../../lib/tauri";

const CHECKOUT_POLL_MS = 5_000;

function useCheckoutState() {
  return useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
}

function openCheckout(url: string) {
  return tauriSystem.openUrl(url, { command: "billing_checkout_open" });
}

function openPortal(url: string) {
  return tauriSystem.openUrl(url, { command: "billing_portal_open" });
}

/**
 * A browser refuses `window.open` once the click's activation is spent, and
 * the session URL only arrives after a request, so a browser tab is claimed
 * inside the click (`reserveBrowserTab`) and pointed at checkout once the URL
 * is known. Desktop opens the system browser, which needs no reservation.
 */
function reserveCheckoutTab(): ReservedTab | null {
  return osIsTauri() ? null : reserveBrowserTab();
}

/**
 * An org checkout's view. `start(orgSlug)` opens Stripe for the active org,
 * `resume(orgSlug, url, tab)` opens a session the gateway already made (a
 * paid create answers one) in a tab the caller reserved inside its click, and
 * `recover(orgSlug)` opens the portal to fix a failed payment, watched the
 * same way so a webhook that lands late still clears the lock unprompted.
 * All three send nothing while a checkout is outstanding (`outstanding` disables
 * every trigger meanwhile) and resolve with the link to offer when no
 * browser opened, else null. `orgSlug` names the org the outstanding
 * checkout pays for, so a surface offers `fallbackUrl` only on that org's
 * screen; `succeeded` names the org this app saw become paid up. The store
 * apps never open Stripe (`refuseNativePurchase`).
 *
 * A failure to create the session was already surfaced and reported by the
 * engine call; `logAndReportError` only adds this context to the log
 * (`runOrgCheckout`).
 */
export function useOrgCheckout() {
  const queryClient = useQueryClient();
  const state = useCheckoutState();
  const begin = useCallback(
    (
      orgSlug: string,
      create: () => Promise<{ url: string }>,
      tab: ReservedTab | null,
      madeUrl?: string,
      open = openCheckout,
    ) =>
      runOrgCheckout(tracker, {
        orgSlug,
        create,
        tab,
        madeUrl,
        open,
        refresh: () =>
          queryClient.invalidateQueries({ queryKey: queryKeys.orgs() }),
        report: logAndReportError,
      }),
    [queryClient],
  );
  const start = useCallback(
    (orgSlug: string) => {
      if (refuseNativePurchase("billing_checkout", reportError)) return;
      void begin(
        orgSlug,
        () => tauriOrg.createCheckout(),
        reserveCheckoutTab(),
      );
    },
    [begin],
  );
  const resume = useCallback(
    (orgSlug: string, url: string, tab: ReservedTab | null) => {
      if (refuseNativePurchase("billing_checkout", reportError)) {
        tab?.discard();
        return Promise.resolve(null);
      }
      return begin(orgSlug, () => Promise.resolve({ url }), tab, url);
    },
    [begin],
  );
  const recover = useCallback(
    (orgSlug: string) => {
      if (refuseNativePurchase("billing_portal", reportError)) return;
      void begin(
        orgSlug,
        () => tauriOrg.createPortal(),
        reserveCheckoutTab(),
        undefined,
        openPortal,
      );
    },
    [begin],
  );
  return {
    start,
    resume,
    recover,
    /** Claim the tab a later `resume` opens checkout in, inside the click. */
    reserveTab: reserveCheckoutTab,
    outstanding: billingCheckoutOutstanding(state),
    orgSlug: state.phase === "idle" ? null : state.orgSlug,
    fallbackUrl: state.phase === "open" ? state.fallbackUrl : null,
    succeeded: state.phase === "succeeded" ? state.orgSlug : null,
  };
}

/**
 * Polls the orgs list while a checkout is open and brings the desktop window
 * forward once its org is paid up. Mounted once, by the shell's plan
 * lifecycle, so the watch outlives whichever screen started it.
 */
export function useOrgCheckoutWatcher() {
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
    void osFocusWindow().catch((error: unknown) =>
      reportError(
        "billing_checkout_focus",
        "Could not focus after checkout",
        error,
      ),
    );
  }, [orgs.data]);
}
