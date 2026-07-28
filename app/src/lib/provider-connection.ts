/**
 * The ONE derivation of "is this provider connected?" (HOU-979).
 *
 * Before this module the same `ProviderStatus` meant opposite things in three
 * places, and the disagreement was the bug:
 *
 *  - the chat model picker read `cli_installed && authenticated`, so an
 *    `unknown` probe was NOT connected and the catalog dropped the provider —
 *    the picker rendered nothing at all;
 *  - the AI Models hub read `cli_installed && auth_state !== "unauthenticated"`,
 *    so the SAME `unknown` probe still read "Connected";
 *  - the in-chat reconnect card cleared only on a confirmed `authenticated`, so
 *    it stayed up forever against `unknown`.
 *
 * One provider, one truth. `unknown` is a THIRD state — "we could not confirm"
 * (engine unreachable, cold pod waking, agent routing not settled yet) — and it
 * renders as a visible, neutral `checking` everywhere: never "Connected", never
 * silently hidden. Only a CONFIRMED `authenticated` is `connected`; only a
 * CONFIRMED `unauthenticated` (or a missing CLI) is `disconnected`.
 */

/** Tri-state probe result as the engine reports it. */
export type ProviderAuthState = "authenticated" | "unauthenticated" | "unknown";

/**
 * The minimal status shape the derivation needs. `authenticated` is the app's
 * denormalized mirror of `auth_state === "authenticated"`; it is honored only
 * when `auth_state` is absent, so a status carrying both can never disagree
 * with itself.
 */
export interface ProviderConnectionStatus {
  cli_installed: boolean;
  authenticated?: boolean;
  auth_state?: ProviderAuthState;
}

/**
 * Per-provider connection state every surface renders from:
 * - `connected`    — confirmed authenticated; models are selectable, the hub
 *                    shows the Connected dot + Sign out.
 * - `checking`     — not confirmable yet (no status while a probe is in flight,
 *                    or an `unknown` probe). Neutral, visible, non-actionable.
 * - `disconnected` — confirmed not usable; the hub offers Connect.
 */
export type ProviderConnectionState = "connected" | "checking" | "disconnected";

/**
 * Resolve a provider's connection state from its (possibly missing) status.
 *
 * `probing` says whether a status is still expected: an absent status while a
 * probe is in flight is `checking`; an absent status once probing has settled
 * (nothing came back for this provider) is `disconnected`, so a surface never
 * spins forever.
 *
 * ORDER MATTERS. `unknown` is tested FIRST, ahead of the missing-CLI check, so
 * the contract holds without exception: an unconfirmable probe is ALWAYS
 * `checking`. The old picker read it that way, and the alternative reports a
 * confident `disconnected` from a status whose every field is a guess.
 */
export function providerConnectionState(
  status: ProviderConnectionStatus | undefined,
  probing: boolean,
): ProviderConnectionState {
  if (!status) return probing ? "checking" : "disconnected";
  if (status.auth_state === "unknown") return "checking";
  if (!status.cli_installed) return "disconnected";
  if (status.auth_state === undefined) {
    // Legacy/partial status with only the denormalized boolean.
    return status.authenticated ? "connected" : "disconnected";
  }
  return status.auth_state === "authenticated" ? "connected" : "disconnected";
}

/**
 * CONFIRMED connected. The single predicate behind every "Connected" badge,
 * every "Sign out" affordance, and every `disconnected -> connected` analytics
 * transition. An `unknown` probe is deliberately false here — it is `checking`,
 * which the surface must render as such rather than as either extreme.
 */
export function providerIsConnected(
  status: ProviderConnectionStatus | undefined,
): boolean {
  return providerConnectionState(status, false) === "connected";
}

/**
 * The PERMISSIVE read: "nothing has confirmed this provider is signed out".
 *
 * NOT a connected predicate — it is true for `unknown` — so it must never drive
 * a Connected badge or hide a Connect CTA. It exists for the two decisions where
 * acting on an unconfirmable probe is the destructive choice:
 *
 *  - the local-model tunnel auto-reconnect (a fabricated "not connected" against
 *    a still-waking pod killed the tunnel for the whole session), and
 *  - the first-load `claudeAvailable` gate (an unconfirmable probe must not
 *    degrade onboarding for a provider that IS connected server-side).
 *
 * It deliberately does NOT reduce to `providerConnectionState(...) !==
 * "disconnected"` for a status carrying no `auth_state`. The predicate this
 * replaced (`cli_installed && auth_state !== "unauthenticated"`) read an ABSENT
 * probe result as "not confirmed signed out"; the strict derivation reads the
 * same status as `disconnected` via the denormalized boolean. Keeping the
 * lenient semantics here is the whole point of having two predicates — the
 * strict one owns every badge and CTA.
 */
export function providerNotConfirmedDisconnected(
  status: ProviderConnectionStatus | undefined,
): boolean {
  if (!status) return false;
  if (status.auth_state === undefined) return status.cli_installed;
  return providerConnectionState(status, false) !== "disconnected";
}

/** The outcome of one reconnect-card confirmation probe. */
export type ProviderProbeOutcome =
  | { ok: true; status: ProviderConnectionStatus }
  | { ok: false };

/**
 * Whether the in-chat reconnect card should clear.
 *
 * Clearing is driven ONLY by a fresh probe that CONFIRMS the provider is
 * connected. Two consequences, both deliberate:
 *
 *  - a failed probe (network blip, pod waking) is not evidence of anything, so
 *    it neither clears the card nor latches it shut: it is simply skipped, and
 *    the very next probe that confirms `connected` clears the card. A reconnect
 *    that succeeded across an errored poll therefore still clears.
 *  - an `unknown` probe is `checking`, not `connected`, so it does not clear —
 *    but with the probe routing fixed it also no longer occurs indefinitely.
 */
export function reconnectCardShouldClear(probe: ProviderProbeOutcome): boolean {
  return probe.ok && providerIsConnected(probe.status);
}
