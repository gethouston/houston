// `.ts` extensions so the node test runner can import this pure module
// directly (Node ESM requires them for runtime-value imports).
import type { ProviderConnectionState } from "../../../lib/provider-connection.ts";
import type { ProviderInfo } from "../../../lib/providers.ts";

/** The two plans the "Connect your AI" card features as cards. */
export type FeaturedSubscription = "claude" | "chatgpt";

/**
 * Each featured plan and the provider card that signs into it, in display
 * order. The ids are the same `anthropic` / `openai` cards the provider
 * browser lists, so a featured card starts exactly the browser row's sign-in.
 */
export const FEATURED_SUBSCRIPTIONS: readonly {
  subscription: FeaturedSubscription;
  providerId: string;
}[] = [
  { subscription: "claude", providerId: "anthropic" },
  { subscription: "chatgpt", providerId: "openai" },
];

export interface FeaturedProvider {
  subscription: FeaturedSubscription;
  provider: ProviderInfo;
}

/**
 * The featured plans the deployment's connect list actually offers (a
 * capability can hide either one), in `FEATURED_SUBSCRIPTIONS` order.
 */
export function featuredProviders(
  providers: readonly ProviderInfo[],
): FeaturedProvider[] {
  const featured: FeaturedProvider[] = [];
  for (const { subscription, providerId } of FEATURED_SUBSCRIPTIONS) {
    const provider = providers.find((p) => p.id === providerId);
    if (provider) featured.push({ subscription, provider });
  }
  return featured;
}

/**
 * The card's two views: the featured plan cards, or every provider in one
 * list. "View more" asks for `all`; with no featured plan to offer, the list
 * is the only view.
 */
export type ConnectAiView = "featured" | "all";

export function resolveConnectAiView(
  requested: ConnectAiView,
  featuredCount: number,
): ConnectAiView {
  return featuredCount === 0 ? "all" : requested;
}

/**
 * What a featured card shows. `ready` is the only state that starts a sign-in;
 * `checking` (an unconfirmable probe) offers no action, the same rule the
 * browser rows follow (HOU-979).
 */
export type SubscriptionCardState =
  | "ready"
  | "checking"
  | "connecting"
  | "connected";

export function subscriptionCardState(
  connection: ProviderConnectionState,
  busy: "connecting" | "signingOut" | undefined,
): SubscriptionCardState {
  if (connection === "connected") return "connected";
  if (busy === "connecting") return "connecting";
  if (connection === "checking") return "checking";
  return "ready";
}
