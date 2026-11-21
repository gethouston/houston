import { BillingCheckoutTracker, presenceDue } from "@houston/sdk";

export const billingCheckout = new BillingCheckoutTracker({
  now: () => Date.now(),
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: (id) => window.clearTimeout(id),
});

const lastPresenceAt = new Map<string, number>();

export function planPresenceDue(orgSlug: string, now: number): boolean {
  return presenceDue(lastPresenceAt.get(orgSlug) ?? null, now);
}

export function markPlanPresence(orgSlug: string, at: number): void {
  lastPresenceAt.set(orgSlug, at);
}

export function resetPlanSessionForIdentityChange(): void {
  billingCheckout.reset();
  lastPresenceAt.clear();
}
