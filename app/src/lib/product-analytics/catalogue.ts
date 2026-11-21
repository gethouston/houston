import type {
  AnalyticsEventName,
  AnalyticsProperty,
} from "../analytics-vocabulary.ts";
import type { ProductEventName } from "./catalogue-table.ts";
import { PRODUCT_EVENTS } from "./catalogue-table.ts";

export type { ProductEventName };
export { PRODUCT_EVENTS };

export type ProductEventValue = string | number | boolean;

export type ProductEventProps = Partial<
  Record<AnalyticsProperty, ProductEventValue>
>;

export const SERVER_OWNED_EVENTS = [
  "user_signed_up",
  "chat_message_sent",
  "account_deleted",
] as const satisfies readonly AnalyticsEventName[];

const PROP_VALUE_MAX = 512;

export function isProductEvent(name: string): name is ProductEventName {
  return Object.hasOwn(PRODUCT_EVENTS, name);
}

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
