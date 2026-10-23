import { useEffect } from "react";
import {
  CHECKOUT_RETURN_CHANNEL,
  type OrgCheckoutReturn,
  orgReturnFromDeepLink,
  orgReturnFromWebUrl,
  parseCheckoutReturnMessage,
} from "../lib/checkout-return";
import { createCheckoutLinkGate } from "../lib/checkout-return-links";
import { reportError } from "../lib/error-report";
import { listenDeepLink } from "../lib/identity/deep-link-listen";
import { openAdmin } from "../lib/open-admin";
import { osCurrentDeepLinks } from "../lib/os-bridge";
import { osIsTauri } from "../lib/os-bridge/platform";
import { billingCheckout } from "../lib/plan-session";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import { useWorkspaceStore } from "../stores/workspaces";

const linkGate = createCheckoutLinkGate(() => Date.now());
/** The org return the web app booted on, taken out of the address bar. */
let bootReturn: OrgCheckoutReturn | null | undefined;
/** A return that arrived before its org was in the workspace list. */
let pending: OrgCheckoutReturn | null = null;

function captureBootReturn(): OrgCheckoutReturn | null {
  if (bootReturn !== undefined) return bootReturn;
  bootReturn = orgReturnFromWebUrl(window.location.href);
  if (bootReturn) window.history.replaceState(window.history.state, "", "/");
  return bootReturn;
}

function refetchBilling(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.orgs() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.billingAll() });
}

/** Switch to the org and open its Billing; held until its space is listed. */
function land(r: OrgCheckoutReturn): void {
  refetchBilling();
  const spaces = useWorkspaceStore.getState();
  const target = spaces.workspaces.find((w) => w.id === `org:${r.org}`);
  if (!target) {
    pending = r;
    return;
  }
  pending = null;
  if (spaces.current?.id !== target.id) spaces.setCurrent(target);
  openAdmin({ section: "billing" });
}

function landLink(link: string, via: "launch" | "live"): void {
  const r = orgReturnFromDeepLink(link);
  if (r && linkGate[via](link)) land(r);
}

/**
 * The web tab that started this org's checkout takes the return page's
 * message: it answers `taken` (so that page closes), focuses, and opens
 * Billing. Every other tab only refetches, so a stray tab never steals it.
 */
function listenForReturnPage(): () => void {
  if (osIsTauri() || typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHECKOUT_RETURN_CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const message = parseCheckoutReturnMessage(event.data);
    if (message?.type !== "returned") return;
    refetchBilling();
    if (!billingCheckout.claimReturn(message.org)) return;
    channel.postMessage({ type: "taken", org: message.org });
    window.focus();
    land(message);
  };
  return () => channel.close();
}

/**
 * Land a returning org checkout on that org's Billing: the desktop deep link
 * (`houston://settings/plan?org=<slug>&checkout=<outcome>`), the web URL the
 * return page links to, and the return page's message to the tab that opened
 * checkout. `useOrgCheckoutWatcher` still focuses the desktop window once the
 * org is paid, in case the link never reaches the app.
 */
export function useOrgCheckoutReturn(): void {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  useEffect(() => {
    const booted = captureBootReturn();
    if (booted) land(booted);
    void osCurrentDeepLinks()
      .then((links) => {
        for (const link of links) landLink(link, "launch");
      })
      .catch((error: unknown) =>
        reportError(
          "checkout_return_initial_link",
          "Could not read initial checkout link",
          error,
        ),
      );
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenDeepLink((link) => landLink(link, "live"))
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) =>
        reportError(
          "checkout_return_deep_link",
          "Could not listen for checkout link",
          error,
        ),
      );
    const stopChannel = listenForReturnPage();
    return () => {
      disposed = true;
      unlisten?.();
      stopChannel();
    };
  }, []);
  useEffect(() => {
    if (pending && workspaces.length) land(pending);
  }, [workspaces]);
}
