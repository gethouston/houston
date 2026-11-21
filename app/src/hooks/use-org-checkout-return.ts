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
let bootCaptured = false;
let pending: OrgCheckoutReturn | null = null;

function takeBootReturn(): OrgCheckoutReturn | null {
  if (bootCaptured) return null;
  bootCaptured = true;
  const booted = orgReturnFromWebUrl(window.location.href);
  if (booted) window.history.replaceState(window.history.state, "", "/");
  return booted;
}

function refetchBilling(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.orgs() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.billingAll() });
}

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

function take(r: OrgCheckoutReturn): void {
  billingCheckout.returned(r.org, r.outcome);
  land(r);
}

function landLink(link: string, via: "launch" | "live"): void {
  const r = orgReturnFromDeepLink(link);
  if (r && linkGate[via](link)) take(r);
}

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
    take(message);
  };
  return () => channel.close();
}

export function useOrgCheckoutReturn(): void {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  useEffect(() => {
    const booted = takeBootReturn();
    if (booted) take(booted);
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
