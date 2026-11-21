import type { ProviderConnectionState } from "../../../lib/provider-connection.ts";
import type { ProviderInfo } from "../../../lib/providers.ts";

export type FeaturedSubscription = "claude" | "chatgpt";

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

export type ConnectAiView = "featured" | "all";

export function resolveConnectAiView(
  requested: ConnectAiView,
  featuredCount: number,
): ConnectAiView {
  return featuredCount === 0 ? "all" : requested;
}

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
