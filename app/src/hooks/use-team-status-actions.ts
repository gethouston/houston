import type { BillingInterval, SeatPrices } from "@houston/engine-adapter";
import { sellsYearly } from "@houston/sdk";
import { useState } from "react";
import type { TeamStatusAction } from "../lib/team-status-model.ts";
import { useUIStore } from "../stores/ui.ts";
import type { useOrgCheckout } from "./queries/use-org-checkout.ts";

/**
 * What each strip button does. Paying opens Stripe (checkout for an org with
 * no subscription, the portal for one whose payment failed), both through the
 * app's one checkout tracker, so the lock clears once the orgs list says the
 * org is paid up, with no focus needed. Where the gateway sells a yearly seat,
 * checkout first opens the monthly-or-yearly dialog (`checkoutOpen`), whose
 * continue calls `startCheckout`; elsewhere it starts monthly at once. Change pick opens Settings > Billing
 * where the free-org row lives, Delete opens Settings where the Danger zone
 * deletes the org, and Use as free org asks first, so it only opens its
 * confirmation.
 */
export function useTeamStatusActions(
  orgSlug: string | null,
  checkout: ReturnType<typeof useOrgCheckout>,
  prices: SeatPrices | null,
) {
  const openSettings = useUIStore((s) => s.openSettings);
  const [claimOpen, setClaimOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Never rejects; resolves with the interval refusal, if any.
  const startCheckout = (interval: BillingInterval) =>
    orgSlug ? checkout.start(orgSlug, interval) : Promise.resolve(null);
  const run = (action: TeamStatusAction) => {
    switch (action) {
      case "checkout":
        if (sellsYearly(prices)) setCheckoutOpen(true);
        else void startCheckout("month");
        return;
      case "portal":
        if (orgSlug) checkout.recover(orgSlug);
        return;
      case "change_pick":
        openSettings("plan");
        return;
      case "claim_free":
        setClaimOpen(true);
        return;
      case "delete":
        openSettings(null);
        return;
    }
  };
  return {
    run,
    claimOpen,
    setClaimOpen,
    checkoutOpen,
    setCheckoutOpen,
    startCheckout,
    paying: checkout.outstanding,
    fallbackUrl: checkout.fallbackUrl,
  };
}
