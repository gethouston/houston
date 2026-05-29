/**
 * Pure decision helpers for the chat model picker (ChatModelSelector).
 *
 * Split out from the component so the visibility / connection logic is
 * unit-testable without a React renderer (the app has no component test
 * runner — see the sibling *.test.mjs files for the node:test pattern) and so
 * the container stays under the file-size budget.
 *
 * Background (issue #342): provider connection status is fetched
 * asynchronously. Before it resolves, the picker must NOT collapse to a single
 * "Not connected" provider — it shows every provider in a neutral "checking"
 * state until the real status arrives. These helpers encode exactly that.
 */

/** Minimal shape of a provider status these helpers need. */
export interface ProviderConnection {
  cli_installed: boolean;
  authenticated: boolean;
}

/**
 * Per-provider state the picker renders:
 * - `connected`    — CLI installed AND authenticated; models selectable.
 * - `disconnected` — status known but not usable; hidden unless it's the
 *                    active provider, where it shows a "Not connected" hint.
 * - `checking`     — status not yet known and a fetch is in flight; shown with
 *                    a neutral "Checking..." hint, models disabled. This is the
 *                    state that prevents the #342 flicker.
 */
export type ProviderPickerState = "connected" | "disconnected" | "checking";

/**
 * Resolve a provider's picker state from its (possibly missing) status and
 * whether the status query is still loading. An absent status while loading is
 * `checking`; an absent status when NOT loading (e.g. the fetch failed) is
 * treated as `disconnected` so the picker degrades to the same safe view it had
 * before — never stuck spinning.
 */
export function providerPickerState(
  status: ProviderConnection | undefined,
  isLoading: boolean,
): ProviderPickerState {
  if (status) {
    return status.cli_installed && status.authenticated ? "connected" : "disconnected";
  }
  return isLoading ? "checking" : "disconnected";
}

/**
 * Whether a provider group should render in the picker.
 *
 * Rules, in order:
 *  1. A lock hides every provider except the locked one (the conversation has
 *     already started on that provider).
 *  2. The active provider is always shown, so the user can see and re-pick the
 *     current selection even when it is disconnected.
 *  3. While `checking`, every provider stays visible — this is the #342 fix:
 *     the list must not collapse to just the active provider before statuses
 *     load.
 *  4. Otherwise show only providers known to be connected; hide the rest.
 */
export function shouldShowProviderInPicker(opts: {
  providerId: string;
  state: ProviderPickerState;
  isActiveProvider: boolean;
  effectiveLock: string | null;
}): boolean {
  const { providerId, state, isActiveProvider, effectiveLock } = opts;
  if (effectiveLock) return providerId === effectiveLock;
  if (isActiveProvider) return true;
  if (state === "checking") return true;
  return state === "connected";
}
