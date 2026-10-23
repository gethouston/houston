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
export type PurchaseCommand = "billing_checkout" | "billing_portal";

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
  "switchToYearly",
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

/**
 * The normalized host of a web URL, `null` for any other scheme, `undefined`
 * when it does not parse. The WHATWG parser is the one the opener runs, so
 * `https://%63heckout.stripe.com` or `//checkout.stripe.com` resolve to the
 * same host here as there; a regex over the raw string misses both.
 */
function webHost(url: string, base?: string): string | null | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return parsed.hostname.toLowerCase().replace(/\.$/, "");
}

/** True for a link to a page where something is bought or billed. */
export function isPurchaseUrl(url: string, base?: string): boolean {
  const host = webHost(url, base);
  return typeof host === "string" && PURCHASE_HOSTS.has(host);
}

/**
 * True when this link must not open here: a payment page inside a store app.
 * Every external open checks it, so a payment link an agent wrote in chat
 * (a checkout the AI Manager started elsewhere) never opens in the store apps.
 * Links resolve against the page, as the native opener resolves them, and a
 * link that does not parse at all is refused there rather than guessed at.
 */
export function blocksPurchaseUrl(url: string): boolean {
  if (canPurchaseInApp()) return false;
  const base = typeof location === "undefined" ? undefined : location.href;
  const host = webHost(url, base);
  return host === undefined || (host !== null && PURCHASE_HOSTS.has(host));
}
