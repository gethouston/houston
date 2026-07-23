import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { registerHoustonBedrockProvider } from "../ai/bedrock";
import { anthropicCredentialCached } from "../backends/claude/credential-status";
import { config } from "../config";

registerHoustonBedrockProvider();

/**
 * Single-user credential store, persisted to dataDir/auth.json (mode 0600).
 * AuthStorage.getApiKey() auto-refreshes OAuth tokens under a file lock, so all
 * agent sessions transparently use the current Claude subscription token.
 */
export const authStorage = AuthStorage.create(
  join(config.dataDir, "auth.json"),
);

/**
 * The stored-credential shapes `credentialUsable` can judge — pi's
 * `AuthCredential` union, structurally (an OAuth token or a plain API key).
 * Widened with a catch-all `type` so an unrecognized future variant reads as
 * NOT usable instead of failing to compile here.
 */
export type StoredCredential =
  | { type: "oauth"; refresh?: string; expires?: number }
  | { type: "api_key" }
  | { type: string };

/**
 * Whether a STORED credential can still produce a working request — presence
 * alone is not connection. The managed-cloud serve path writes OAuth entries
 * with refresh="" (Gate #2, access-only); when the control plane then stops
 * serving (an outage, a central disconnect the provenance gate couldn't
 * remove), the dead entry lingers in auth.json and `has()` kept reporting the
 * provider connected while every turn failed with the reconnect card. The rule:
 * - an API key never expires (it was live-verified at connect);
 * - an OAuth entry with a refresh token is usable (pi auto-refreshes it);
 * - an OAuth entry with NO refresh token is usable only until `expires`
 *   (`expires` 0/absent = no expiry recorded, e.g. a pasted token — usable).
 * Mirrors backends/claude/read-token.ts, which already refuses to hand the SDK
 * an expired served token.
 */
export function credentialUsable(
  cred: StoredCredential | undefined,
  now: number = Date.now(),
): boolean {
  if (!cred) return false;
  if (cred.type === "api_key") return true;
  if (cred.type !== "oauth") return false;
  const c = cred as { refresh?: string; expires?: number };
  if (c.refresh) return true;
  const expires = c.expires ?? 0;
  return expires <= 0 || expires > now;
}

/**
 * Whether the user has CONNECTED this provider here — i.e. a USABLE credential
 * is STORED in auth.json (a UI paste-a-key, an OAuth sign-in, or a cloud-served
 * central credential the host wrote in).
 *
 * Deliberately the stored entry only, NOT `hasAuth()`. `hasAuth()` ALSO returns
 * true for an ambient env var (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, …), a CLI
 * `--api-key` override, or a models.json fallback. Those can make a model
 * callable, but none is a connection the user made through Houston, and none is
 * something "Sign out" can clear — so counting them leaves the provider stuck
 * "connected" forever and the logout button does nothing (HOU-557). pi's own
 * `AuthStorage.getAuthStatus()` draws the exact same line: a stored credential
 * is `configured`, env / override / fallback are not.
 *
 * The stored entry must also be USABLE (`credentialUsable`): a serve-written
 * access-only token that expired with no refresh token is a dead credential,
 * and reporting it connected showed a "Connected" provider whose every turn
 * failed with the reconnect card.
 *
 * ANTHROPIC is the exception: its primary desktop credential is NOT in auth.json
 * at all — the browser login (`claude auth login`) caches it in the shared login
 * dir (Keychain / `.credentials.json`), read only by the `claude` binary. So it
 * counts as connected when EITHER a usable setup-token/served entry is in
 * auth.json OR the shared-dir credential signal reads logged-in
 * (`anthropicCredentialCached`, warmed by `getAuthStatus`).
 *
 * Pure over its inputs (store + the cached probe) so the rule stays testable.
 */
export function providerConnected(
  store: Pick<AuthStorage, "get">,
  id: string,
): boolean {
  const usable = credentialUsable(
    store.get(id) as StoredCredential | undefined,
  );
  if (id === "anthropic") return usable || anthropicCredentialCached();
  return usable;
}

export const modelRegistry = ModelRegistry.create(
  authStorage,
  join(config.dataDir, "models.json"),
);
