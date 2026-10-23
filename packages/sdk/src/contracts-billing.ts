/**
 * What an org pays and may use: its subscription and the hosted pages that
 * change it, the free slot, a free org's pool and routine rules, the checkout
 * an app has open, and the per-person plan the Plan screen still reads.
 *
 * Re-exported wholesale by the package barrel; import from `@houston/sdk`.
 */
// ===== Billing module contract =========================================
// `BillingSummary` and the org billing shapes are the spaces module's — every
// space carries its billing on `OrgSummary.billing` — so they are exported
// once, under Spaces.
export {
  type BillingCheckout,
  type BillingChoiceSave,
  BillingCommand,
  type BillingCommandType,
  BillingHttpError,
  type BillingModule,
  billingChoiceRefusal,
  type ClaimFreeSlotResult,
  claimFreeSlotRefusal,
} from "./modules/billing";
export {
  BILLING_CHECKOUT_WINDOW_MS,
  type BillingCheckoutPorts,
  type BillingCheckoutStart,
  type BillingCheckoutState,
  BillingCheckoutTracker,
  billingCheckoutOutstanding,
  orgPaidUp,
} from "./modules/billing/checkout-tracker";
export {
  planComposerMode,
  planDialog,
  planLaunchRefreshDelay,
  presenceDue,
  usagePercent,
} from "./modules/billing/model";
export {
  plusCheckoutOrgSlug,
  plusOfferApplies,
} from "./modules/billing/plus-org";
export {
  type OrgStanding,
  orgLocked,
  orgRecovering,
  orgRecovery,
  orgStanding,
} from "./modules/billing/recovery";
// ===== Plan module contract ===========================================
export { PlanCommand, PlanHttpError, type PlanModule } from "./modules/plan";
export {
  formatLaunchDate,
  formatLaunchMonthDay,
  formatLocalDate,
  formatLocalDateTime,
  formatPlanAmount,
  LAUNCH_TIME_ZONE,
  stripeCurrencyDecimals,
} from "./modules/plan/format";
export {
  type PlusCheckoutRefusal,
  plusCheckoutRefusal,
} from "./modules/plan/refusals";
