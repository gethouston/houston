import type { BillingCheckoutReturnOutcome } from "@houston/sdk";

export type CheckoutOutcome = BillingCheckoutReturnOutcome;

export interface OrgCheckoutReturn {
  org: string;
  outcome: CheckoutOutcome;
}

const ORG_SLUG = /^[a-f0-9]{16}$/;

export const CHECKOUT_RETURN_CHANNEL = "houston.checkout-return";

export type CheckoutReturnMessage =
  | ({ type: "returned" } & OrgCheckoutReturn)
  | { type: "taken"; org: string };

function outcomeOf(value: string | null): CheckoutOutcome | null {
  return value === "success" || value === "cancel" ? value : null;
}

function orgReturn(
  org: string | null,
  outcome: CheckoutOutcome | null,
): OrgCheckoutReturn | null {
  return org && outcome && ORG_SLUG.test(org) ? { org, outcome } : null;
}

export function orgReturnFromCheckoutPage(
  search: string,
  complete: boolean,
): OrgCheckoutReturn | null {
  const params = new URLSearchParams(search);
  if (params.get("kind") !== "org") return null;
  return orgReturn(params.get("org"), complete ? "success" : "cancel");
}

export function desktopReturnLink(r: OrgCheckoutReturn): string {
  return `houston://settings/plan?org=${r.org}&checkout=${r.outcome}`;
}

export function webReturnPath(r: OrgCheckoutReturn): string {
  return `/settings/billing?org=${r.org}&checkout=${r.outcome}`;
}

export function orgReturnFromDeepLink(link: string): OrgCheckoutReturn | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "houston:" || url.hostname !== "settings") return null;
  if (!/^\/plan\/?$/.test(url.pathname)) return null;
  return orgReturn(
    url.searchParams.get("org"),
    outcomeOf(url.searchParams.get("checkout")),
  );
}

export function orgReturnFromWebUrl(href: string): OrgCheckoutReturn | null {
  const url = new URL(href);
  if (!/^\/settings\/billing\/?$/.test(url.pathname)) return null;
  return orgReturn(
    url.searchParams.get("org"),
    outcomeOf(url.searchParams.get("checkout")),
  );
}

export function parseCheckoutReturnMessage(
  data: unknown,
): CheckoutReturnMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, org, outcome } = data as Record<string, unknown>;
  if (typeof org !== "string" || !ORG_SLUG.test(org)) return null;
  if (type === "taken") return { type, org };
  if (type !== "returned" || typeof outcome !== "string") return null;
  const parsed = outcomeOf(outcome);
  return parsed ? { type, org, outcome: parsed } : null;
}
