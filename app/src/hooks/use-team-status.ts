import { teamStatusView } from "../lib/team-status-model.ts";
import { useActiveOrgBilling } from "./queries/use-billing.ts";
import { useBillingChoice } from "./queries/use-billing-choice.ts";
import { useOrgCheckout } from "./queries/use-org-checkout.ts";
import { useChoiceNow } from "./use-choice-now.ts";
import { useSurfaceGates } from "./use-surface-gates.ts";

/**
 * The org-status strip's view for the ACTIVE org, the Personal row included,
 * from the memberships list every member reads. It clears only when that list
 * says the org is working again, never on a button press. `purchasable` is
 * the caller's `canPurchaseInApp()`: the store apps never sell.
 */
export function useTeamStatus(purchasable: boolean) {
  const { billing, org, orgs } = useActiveOrgBilling();
  const { data: choice } = useBillingChoice();
  const now = useChoiceNow(choice);
  const checkout = useOrgCheckout();
  const { showWorkspaceDanger } = useSurfaceGates();
  const view = teamStatusView({
    billing,
    degraded: org?.degraded ?? false,
    role: org?.role ?? null,
    choice: choice ?? null,
    purchasable,
    checkoutOutstanding: checkout.outstanding,
    canDelete: showWorkspaceDanger,
    now,
  });
  return { view, org, orgs, checkout };
}
