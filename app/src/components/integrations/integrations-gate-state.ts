export const resyncedTokens = new Set<string>();
export const readyTokens = new Set<string>();
export const resyncingTokens = new Set<string>();

export function resetIntegrationGateForIdentityChange(): void {
  resyncedTokens.clear();
  readyTokens.clear();
  resyncingTokens.clear();
}
