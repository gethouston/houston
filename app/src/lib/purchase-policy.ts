import { osIsNativeMobile } from "./os-bridge/platform";

export type PurchaseCommand = "billing_checkout" | "billing_portal";

export function canPurchaseInApp(): boolean {
  return !osIsNativeMobile();
}

export function refuseNativePurchase(
  command: PurchaseCommand,
  report: (command: string, message: string) => void,
): boolean {
  if (canPurchaseInApp()) return false;
  report(command, "Purchase entry point reached inside the store app");
  return true;
}

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

const PURCHASE_HOSTS: ReadonlySet<string> = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
  "invoice.stripe.com",
  "pay.stripe.com",
  "buy.stripe.com",
]);

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

export function isPurchaseUrl(url: string, base?: string): boolean {
  const host = webHost(url, base);
  return typeof host === "string" && PURCHASE_HOSTS.has(host);
}

export function blocksPurchaseUrl(url: string): boolean {
  if (canPurchaseInApp()) return false;
  const base = typeof location === "undefined" ? undefined : location.href;
  const host = webHost(url, base);
  return host === undefined || (host !== null && PURCHASE_HOSTS.has(host));
}
