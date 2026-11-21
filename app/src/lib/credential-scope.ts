import type { CredentialScope } from "@houston/engine-adapter";

export interface CredentialContext {
  scope?: CredentialScope;
}

export function credentialScopeOf(
  row: CredentialContext | undefined,
): CredentialScope | null {
  return row?.scope === "personal" || row?.scope === "team" ? row.scope : null;
}

export function statusCredentialScope(
  status: { credentialScope?: CredentialScope } | undefined,
): CredentialScope | null {
  return credentialScopeOf({ scope: status?.credentialScope });
}
