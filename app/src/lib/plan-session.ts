import { BillingCheckoutTracker, presenceDue } from "@houston/sdk";

/**
 * The org plan's per-identity client memory: the app's one outstanding
 * checkout and the last presence report per org. Both live outside React so
 * they outlive whichever surface used them, which is exactly why an identity
 * change must wipe them (`resetPlanSessionForIdentityChange`).
 */

/** The app's one outstanding-checkout state, shared by every checkout trigger. */
export const billingCheckout = new BillingCheckoutTracker({
  now: () => Date.now(),
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: (id) => window.clearTimeout(id),
});

/** Presence keeps one org's routines from pausing, so it is reported per org. */
const lastPresenceAt = new Map<string, number>();

/** True when this identity's presence in `orgSlug` has not been reported recently. */
export function planPresenceDue(orgSlug: string, now: number): boolean {
  return presenceDue(lastPresenceAt.get(orgSlug) ?? null, now);
}

export function markPlanPresence(orgSlug: string, at: number): void {
  lastPresenceAt.set(orgSlug, at);
}

/** Identity swaps must not inherit the outgoing account's checkout or presence. */
export function resetPlanSessionForIdentityChange(): void {
  billingCheckout.reset();
  lastPresenceAt.clear();
}
