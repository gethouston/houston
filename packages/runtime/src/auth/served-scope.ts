import {
  currentCredentialScope,
  isPersonalScope,
} from "../session/acting-context";

export type ServedCredentialScope = "personal" | "team";

const served = new Map<string, ServedCredentialScope>();

function markFor(scopeKey: string, provider: string): string {
  return `${scopeKey}:${provider}`;
}

export function recordServedScope(
  provider: string,
  scope: ServedCredentialScope,
): void {
  const { key } = currentCredentialScope();
  if (!isPersonalScope(key)) return;
  served.set(markFor(key, provider), scope);
}

export function forgetServedScope(provider: string): void {
  const { key } = currentCredentialScope();
  if (!isPersonalScope(key)) return;
  served.delete(markFor(key, provider));
}

export function servedScopeFor(
  provider: string,
): ServedCredentialScope | undefined {
  const { key } = currentCredentialScope();
  if (!isPersonalScope(key)) return undefined;
  return served.get(markFor(key, provider));
}

export function resetServedScopes(): void {
  served.clear();
}
