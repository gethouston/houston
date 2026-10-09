import type { planDialog } from "@houston/sdk";
import { osIsNativeMobile } from "./os-bridge/platform";

/**
 * Where a purchase may happen. Apple and Google forbid selling a digital
 * subscription inside a store app outside their own in-app purchase, so
 * Houston sells on the web only: inside the iOS/Android app no price, no
 * checkout, no billing portal and no upsell is ever drawn. Desktop and every
 * browser tab (a phone's included) keep the full purchase flow.
 *
 * Every purchase surface consults this module, never the platform check
 * directly, so the rule lives in one place.
 */

/** The Stripe pages a hook can open, named as their failure reports are. */
export type PurchaseCommand =
  | "plus_checkout"
  | "plus_portal"
  | "billing_checkout"
  | "billing_portal";

/** True where Houston may show prices and open checkout or the portal. */
export function canPurchaseInApp(): boolean {
  return !osIsNativeMobile();
}

/**
 * The last line of defense in every checkout and portal hook: true (and
 * reported) when this surface must not open Stripe. Reaching it is a bug,
 * since no purchase button is drawn in the store apps, so it goes to the
 * error reports and the person sees nothing.
 */
export function refuseNativePurchase(
  command: PurchaseCommand,
  report: (command: string, message: string) => void,
): boolean {
  if (canPurchaseInApp()) return false;
  report(command, "Purchase entry point reached inside the store app");
  return true;
}

/**
 * The AI Manager operations that start a purchase or open billing: the
 * manager's approval card for one is a refusal in the store apps.
 */
const PURCHASE_OPERATIONS: ReadonlySet<string> = new Set([
  "createPlusCheckout",
  "createPlusPortal",
  "createCheckout",
  "createPortal",
]);

export function isPurchaseOperation(operation: string): boolean {
  return PURCHASE_OPERATIONS.has(operation);
}

/** Stripe's hosted payment pages: checkout, the billing portal, invoices,
 *  payment links. */
const PURCHASE_HOSTS: ReadonlySet<string> = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
  "invoice.stripe.com",
  "pay.stripe.com",
  "buy.stripe.com",
]);

/** The host of an absolute web URL (no userinfo, no port), or null. */
const WEB_HOST = /^\s*https?:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i;

/** True for a link to a page where something is bought or billed. */
export function isPurchaseUrl(url: string): boolean {
  const host = WEB_HOST.exec(url)?.[1];
  return (
    host !== undefined &&
    PURCHASE_HOSTS.has(host.toLowerCase().replace(/\.$/, ""))
  );
}

/**
 * True when this link must not open here: a payment page inside a store app.
 * Every external open checks it, so a payment link an agent wrote in chat
 * (a checkout the AI Manager started elsewhere) never opens in the store apps.
 */
export function blocksPurchaseUrl(url: string): boolean {
  return !canPurchaseInApp() && isPurchaseUrl(url);
}

type PlanDialog = ReturnType<typeof planDialog>;

/**
 * The plan dialog this surface may open. The launch announcement is a sales
 * dialog (prices, a checkout button), so the store apps never open it; the
 * routine dialogs (resume, keep) are not purchases and always may.
 */
export function storeSafePlanDialog(dialog: PlanDialog): PlanDialog {
  return dialog === "announcement" && !canPurchaseInApp() ? null : dialog;
}
