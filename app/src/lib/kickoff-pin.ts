/**
 * The provider/model pair a brand-new agent is CREATED with — the one decision
 * shared by the create-agent dialog and the "From a friend" import.
 *
 * A pin is written into the agent's config and drives its very first turn, so
 * it outlives the screen that made it. That is why only a CONFIRMED connection
 * is ever worth pinning: the selector's non-blocking fallback (last-used, or
 * Anthropic) is a guess for the user to look at, not a fact to persist.
 */

import { pickDefaultProviderModel } from "./default-provider-model.ts";

/** The provider/model pinned onto the new agent. Empty when neither is confirmed. */
export interface KickoffPin {
  provider?: string;
  model?: string;
}

export interface KickoffPinFromScanOptions {
  /**
   * The user's confirmed connected providers, or `null` when the provider scan
   * could not answer — see `confirmedConnectedProviders`.
   */
  connected: readonly string[] | null;
  lastUsedProvider: string | null | undefined;
  lastUsedModel: string | null | undefined;
}

/**
 * The pin a provider scan justifies, or `null` for "ask again before deciding".
 *
 * Three answers, because the scan has three states:
 *
 *  - a pair, when the scan CONFIRMS a connection to pin to;
 *  - `{}` — pin nothing — when the scan is confirmed and names no connected
 *    provider we can pin. A new agent with no saved provider falls to the first
 *    connected one at turn time, and with none connected the turn surfaces the
 *    connect card, which is the honest outcome;
 *  - `null` when the scan cannot answer (still loading, failed, or carrying an
 *    unconfirmable probe). That is NOT evidence of anything: the shared status
 *    query is cached, and a stale "Anthropic is connected" would pin the agent
 *    to a provider the user has just signed out of. The caller re-probes and
 *    decides on the fresh answer.
 */
export function kickoffPinFromScan({
  connected,
  lastUsedProvider,
  lastUsedModel,
}: KickoffPinFromScanOptions): KickoffPin | null {
  if (connected === null) return null;
  const resolved = pickDefaultProviderModel({
    lastUsedProvider,
    lastUsedModel,
    connectedProviders: connected,
  });
  return resolved.confirmed
    ? { provider: resolved.provider, model: resolved.model }
    : {};
}
