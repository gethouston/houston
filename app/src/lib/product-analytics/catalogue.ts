/**
 * WHAT HOUSTON GATHERS ABOUT PRODUCT USAGE — the rules around the table in
 * `catalogue-table.ts`, and the front door every caller reads it through.
 *
 * The gateway's Postgres is the single source of truth for product analytics,
 * and the split between the two writers is deliberate:
 *
 *  - the SERVER writes every fact it can observe by itself (an account being
 *    minted, a conversation message it accepted, an account deletion). Those
 *    names are server-owned: the ingest route refuses them from a client, so a
 *    tampered or buggy app can never manufacture them.
 *  - the CLIENT sends only INTENT the server can never see — which answer was
 *    confirmed, which skill was invoked, which screen was opened. That is
 *    exactly that table, and nothing outside it leaves the device.
 *
 * PostHog is untouched and entirely separate: `analytics.track` still reports
 * to it from the same call sites, and this catalogue only decides which of
 * those beats ALSO ride the first-party pipe. Adding a name to the table is
 * the only way to gather something new — there are no other client event
 * sources.
 */

import type { AnalyticsEventName, AnalyticsProperty } from "../analytics.ts";
import type { ProductEventName } from "./catalogue-table.ts";
import { PRODUCT_EVENTS } from "./catalogue-table.ts";

export type { ProductEventName };
export { PRODUCT_EVENTS };

/** The only value shapes the ingest route accepts. */
export type ProductEventValue = string | number | boolean;

export type ProductEventProps = Partial<
  Record<AnalyticsProperty, ProductEventValue>
>;

/**
 * Names only the gateway may write. Listed so the boundary is readable from
 * this side too — the route rejects them, and they are absent from the table,
 * so the client has no way to send one.
 */
export const SERVER_OWNED_EVENTS = [
  "user_signed_up",
  "chat_message_sent",
  "account_deleted",
] as const satisfies readonly AnalyticsEventName[];

/** Longest string a property value may carry; the route refuses more. */
const PROP_VALUE_MAX = 512;

export function isProductEvent(name: string): name is ProductEventName {
  return Object.hasOwn(PRODUCT_EVENTS, name);
}

/**
 * The allowed subset of `props` for this event, with every value coerced into
 * what the route accepts. An over-long string is truncated rather than
 * dropped: the route rejects the WHOLE event on one invalid property, so
 * trimming a runaway slug keeps the event itself countable.
 */
export function pickProductProps(
  name: ProductEventName,
  props?: Record<string, unknown>,
): ProductEventProps {
  const picked: ProductEventProps = {};
  if (!props) return picked;
  for (const key of PRODUCT_EVENTS[name].props) {
    const value = props[key];
    if (typeof value === "string") picked[key] = value.slice(0, PROP_VALUE_MAX);
    else if (typeof value === "number" && Number.isFinite(value))
      picked[key] = value;
    else if (typeof value === "boolean") picked[key] = value;
  }
  return picked;
}
