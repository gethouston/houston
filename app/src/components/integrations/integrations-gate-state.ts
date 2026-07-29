/** Per-identity bookkeeping for the integration session-resync backstop. */
export const resyncedTokens = new Set<string>();
export const readyTokens = new Set<string>();
export const resyncingTokens = new Set<string>();

/** Identity swaps must not retain JWT-keyed resync state. */
export function resetIntegrationGateForIdentityChange(): void {
  resyncedTokens.clear();
  readyTokens.clear();
  resyncingTokens.clear();
}
