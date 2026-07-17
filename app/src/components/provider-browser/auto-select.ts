/**
 * Pure auto-select resolution for {@link ProviderBrowser}: given the previous
 * and next per-card status snapshots, decide whether a provider just became
 * connected and, if so, which (providerId, model) the browser should hand to
 * its `onSelect` callback. This is the connect-transition behavior onboarding
 * relies on (advance the moment a provider connects) without duplicating the
 * `provider_configured` analytics — the status hook already fires that.
 *
 * Kept component-free so it unit-tests with `node --test`
 * (`app/tests/provider-auto-select.test.ts`).
 */

import type { ProviderInfo } from "../../lib/providers.ts";
import type { ProviderStatus } from "../../lib/tauri.ts";
import { providerIsAuthenticated } from "../shell/provider-reconnect-state.ts";

/** A per-card status snapshot: card id -> merged status (or undefined). */
export type StatusSnapshot = Record<string, ProviderStatus | undefined>;

/** The provider + model the browser should auto-select. */
export interface AutoSelection {
  providerId: string;
  model: string;
}

function isConnected(status: ProviderStatus | undefined): boolean {
  // Confirmed-only: an "unknown" probe (engine unreachable / still waking)
  // must never auto-advance onboarding as if the provider just connected.
  return status ? providerIsAuthenticated(status) : false;
}

/**
 * Resolve the first provider that should auto-select, or `null` if none.
 *
 * Fires for a provider that transitions from not-connected to connected
 * between `prev` and `next`. The very first snapshot has no `prev` (`prev` is
 * `null`): a provider already connected on that first load auto-selects ONLY
 * when `selectOnMount` is true (onboarding re-entry — a user who connected in a
 * previous session should still advance); the hub leaves it false so opening
 * the Providers tab never fires a selection.
 *
 * The resolved model mirrors the legacy picker: `provider.defaultModel` when the
 * card has a static one, else the engine-reported `active_model` (the
 * OpenAI-compatible/local provider's user-supplied id). A transition with no
 * resolvable model is skipped rather than firing a selection with no model.
 */
export function resolveAutoSelect(
  prev: StatusSnapshot | null,
  next: StatusSnapshot,
  providers: readonly ProviderInfo[],
  options: { selectOnMount: boolean },
): AutoSelection | null {
  const firstLoad = prev === null;
  for (const provider of providers) {
    const cur = next[provider.id];
    if (!isConnected(cur)) continue;
    const wasConnected = prev ? isConnected(prev[provider.id]) : false;
    if (wasConnected) continue;
    // A not-connected -> connected transition (or a first-seen connected card).
    // On the very first snapshot, only auto-select when the caller opted in.
    if (firstLoad && !options.selectOnMount) continue;
    const model = provider.defaultModel || cur?.active_model;
    if (model) return { providerId: provider.id, model };
  }
  return null;
}
