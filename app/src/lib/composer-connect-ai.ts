/**
 * The one rule that decides whether the chat composer is replaced by the
 * "Connect AI" empty state.
 *
 * Why it exists: with NO provider connected the composer still rendered a full
 * input row — a model picker showing a phantom model (the effective-provider
 * default resolves to `anthropic` even when nothing is logged in) and a textarea
 * that accepts a message no provider can answer. Typing into a dead end is the
 * worst possible first state, so the whole input area is swapped for one honest
 * CTA into the AI Hub.
 *
 * The rule is deliberately CONSERVATIVE — every uncertain signal keeps the
 * normal composer, because a composer that flashes away and back on boot reads
 * as a broken app, while a composer that lingers one beat too long reads as
 * nothing at all. Concretely, we replace only when all four of these hold:
 *
 *  1. the provider probe has SETTLED (`statusesLoading` false — which already
 *     folds in the space gate; see `provider-statuses-query.ts`) and did not
 *     fail: an errored probe knows nothing, it does not know "zero";
 *  2. nothing is still "checking" — an unconfirmable probe may yet confirm;
 *  3. the provider catalog and the deployment capabilities have both landed, so
 *     we are not judging emptiness against a half-hydrated world; and
 *  4. exactly zero providers are confirmed connected.
 *
 * Pure and dependency-free so the whole decision is unit-testable without a
 * React renderer or a QueryClient.
 */

/** Every signal the decision reads. */
export interface ConnectAiComposerSignals {
  /** `useProviderStatuses().isLoading` — first probe, no cached data yet. */
  statusesLoading: boolean;
  /** `useProviderStatuses().isError` — the probe failed outright. */
  statusesError: boolean;
  /** Providers confirmed connected (`providerIsConnected`). */
  connectedCount: number;
  /** Providers whose probe is inconclusive (`providerConnectionState` "checking"). */
  checkingCount: number;
  /** `useProviderCatalog().isReady` — the runnable provider/model set landed. */
  catalogReady: boolean;
  /** `useCapabilities()` settled — the deployment described itself. */
  capabilitiesLoaded: boolean;
}

/**
 * Whether the composer should be replaced by the connect-AI empty state.
 *
 * See the module comment for why every branch below fails CLOSED (keeps the
 * normal composer) rather than guessing at emptiness.
 */
export function shouldReplaceComposerWithConnectAi(
  signals: ConnectAiComposerSignals,
): boolean {
  if (signals.statusesLoading || signals.statusesError) return false;
  if (!signals.catalogReady || !signals.capabilitiesLoaded) return false;
  if (signals.checkingCount > 0) return false;
  return signals.connectedCount === 0;
}
