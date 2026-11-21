import type { BillingInterval, SeatPrices } from "@houston/engine-adapter";
import { sellsYearly } from "@houston/sdk";
import { useState } from "react";
import type { TeamStatusAction } from "../lib/team-status-model.ts";
import { useUIStore } from "../stores/ui.ts";
import type { useOrgCheckout } from "./queries/use-org-checkout.ts";

export function useTeamStatusActions(
  orgSlug: string | null,
  checkout: ReturnType<typeof useOrgCheckout>,
  prices: SeatPrices | null,
) {
  const openSettings = useUIStore((s) => s.openSettings);
  const [claimOpen, setClaimOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
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
  };
}
