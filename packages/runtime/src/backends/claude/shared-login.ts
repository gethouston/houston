import { readServedProvidersAt } from "../../auth/auth-file";
import { servedManifestPathFor, serveModeOn } from "../../auth/serve-context";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import type { ClaudeToken } from "./backend-types";
import { claudeCredentialsFile } from "./paths";
import { readSharedLoginFile } from "./shared-login-file";

export interface SharedLogin {
  token: ClaudeToken;
  expiresAt: number;
}

// WHY: A pushed login updates one agent's auth.json, not the Keychain the other agents read. ADR-0009
export function readSharedLogin(
  now: number = Date.now(),
): SharedLogin | undefined {
  if (isPersonalScope(currentCredentialScope().key)) return undefined;
  const cred = readSharedLoginFile(claudeCredentialsFile());
  if (!cred) return undefined;
  const expiresAt = cred.expiresAt ?? 0;
  if (expiresAt > 0 && expiresAt <= now) return undefined;
  const value = cred.accessToken.trim();
  if (!value) return undefined;
  return { token: { kind: "oauth-token", value }, expiresAt };
}

export function anthropicIsCentrallyServed(): boolean {
  if (!serveModeOn()) return false;
  return readServedProvidersAt(servedManifestPathFor()).includes("anthropic");
}

export interface StoredLogin {
  value: string;
  expires: number;
}

// WHY: Anthropic tokens have a fixed lifetime, so later expiry means later issuance. ADR-0009
export function sharedLoginSupersedes(
  shared: SharedLogin,
  stored: StoredLogin,
): boolean {
  return (
    shared.token.value !== stored.value &&
    shared.expiresAt > stored.expires &&
    !anthropicIsCentrallyServed()
  );
}
