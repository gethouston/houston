/**
 * The way back from an org seat checkout. Stripe returns the person to the web
 * app's shared page, `/checkout/complete?kind=org&org=<slug>` (or
 * `/checkout/cancel?...`), which hands them to that org's Billing:
 *
 *  - the web tab that opened checkout, told over a BroadcastChannel (the
 *    reserved tab's opener is severed, `browser-tab.ts`), answers `taken` and
 *    the return tab closes;
 *  - otherwise the page tries the desktop app once with
 *    `houston://settings/plan?org=<slug>&checkout=<outcome>`, and offers that
 *    link plus the web app's `/settings/billing?org=<slug>&checkout=<outcome>`.
 *
 * The desktop link reuses `settings/plan`, the one settings path the shell
 * already forwards, so a desktop build that predates the org parameter still
 * comes forward and opens Settings.
 *
 * DOM-free so the return page and the app share one grammar, node-testable.
 */

export type CheckoutOutcome = "success" | "cancel";

export interface OrgCheckoutReturn {
  org: string;
  outcome: CheckoutOutcome;
}

/** Same grammar as a team workspace's slug (`space-id.ts`). */
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

/** The org return a `/checkout/complete|cancel` page carries, if any. */
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

/** `houston://settings/plan?org=<slug>&checkout=<outcome>`, else null. */
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

/** The web app opened on `/settings/billing?org=<slug>&checkout=<outcome>`. */
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
