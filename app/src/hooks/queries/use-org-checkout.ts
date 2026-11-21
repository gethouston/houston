import type {
  BillingInterval,
  OrgsList,
  SeatCheckoutOutcome,
  SeatIntervalRefusal,
} from "@houston/engine-adapter";
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
import { useSeatRefusalToast } from "../use-seat-refusal-toast";

const CHECKOUT_POLL_MS = 5_000;

function useCheckoutState() {
  return useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
}

function openCheckout(url: string) {
  return tauriSystem.openUrl(url, { command: "billing_checkout_open" });
}

function startOver(orgSlug: string) {
  tracker.abandon(orgSlug);
}

function openPortal(url: string) {
  return tauriSystem.openUrl(url, { command: "billing_portal_open" });
}

function reserveCheckoutTab(): ReservedTab | null {
  return osIsTauri() ? null : reserveBrowserTab();
}

export function useOrgCheckout() {
  const queryClient = useQueryClient();
  const state = useCheckoutState();
  const announceRefusal = useSeatRefusalToast();
  const begin = useCallback(
    (
      orgSlug: string,
      create: () => Promise<SeatCheckoutOutcome>,
      tab: ReservedTab | null,
      madeUrl?: string,
      open = openCheckout,
      onRefused?: (refusal: SeatIntervalRefusal) => void,
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
        onRefused,
      }),
    [queryClient],
  );
  const start = useCallback(
    async (
      orgSlug: string,
      interval: BillingInterval,
    ): Promise<SeatIntervalRefusal | null> => {
      if (refuseNativePurchase("billing_checkout", reportError)) return null;
      const seen: { refusal: SeatIntervalRefusal | null } = { refusal: null };
      await begin(
        orgSlug,
        () => tauriOrg.createCheckout(interval),
        reserveCheckoutTab(),
        undefined,
        openCheckout,
        (refusal) => {
          seen.refusal = refusal;
          announceRefusal(refusal);
        },
      );
      return seen.refusal;
    },
    [begin, announceRefusal],
  );
  const resume = useCallback(
    (orgSlug: string, url: string, tab: ReservedTab | null) => {
      if (refuseNativePurchase("billing_checkout", reportError)) {
        tab?.discard();
        return Promise.resolve(null);
      }
      return begin(
        orgSlug,
        () => Promise.resolve({ kind: "checkout" as const, url }),
        tab,
        url,
      );
    },
    [begin],
  );
  const recover = useCallback(
    (orgSlug: string) => {
      if (refuseNativePurchase("billing_portal", reportError)) return;
      void begin(
        orgSlug,
        async () => ({
          kind: "checkout" as const,
          ...(await tauriOrg.createPortal()),
        }),
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
    reserveTab: reserveCheckoutTab,
    outstanding: billingCheckoutOutstanding(state),
    open: state.phase === "open" ? state : null,
    startOver,
    succeeded: state.phase === "succeeded" ? state.orgSlug : null,
  };
}

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
