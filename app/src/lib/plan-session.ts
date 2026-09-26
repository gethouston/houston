import { PlusCheckoutTracker, presenceDue } from "@houston/sdk";

/**
 * The personal plan's per-identity client memory: the app's one outstanding
 * Plus checkout and the last presence report. Both live outside React so they
 * outlive whichever surface used them, which is exactly why an identity change
 * must wipe them (`resetPlanSessionForIdentityChange`).
 */

/** The app's one outstanding-checkout state, shared by every checkout trigger. */
export const plusCheckout = new PlusCheckoutTracker({
  now: () => Date.now(),
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: (id) => window.clearTimeout(id),
});

let lastPresenceAt: number | null = null;

/** True when this identity's presence has not been reported recently. */
export function planPresenceDue(now: number): boolean {
  return presenceDue(lastPresenceAt, now);
}

export function markPlanPresence(at: number): void {
  lastPresenceAt = at;
}

/** Identity swaps must not inherit the outgoing account's checkout or presence. */
export function resetPlanSessionForIdentityChange(): void {
  plusCheckout.reset();
  lastPresenceAt = null;
}
