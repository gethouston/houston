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
 * Whether the user has CONNECTED this provider here — i.e. a credential is
 * STORED in auth.json (a UI paste-a-key, an OAuth sign-in, or a cloud-served
 * central credential the host wrote in).
 *
 * Deliberately `has()` (stored only), NOT `hasAuth()`. `hasAuth()` ALSO returns
 * true for an ambient env var (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, …), a CLI
 * `--api-key` override, or a models.json fallback. Those can make a model
 * callable, but none is a connection the user made through Houston, and none is
 * something "Sign out" can clear — so counting them leaves the provider stuck
 * "connected" forever and the logout button does nothing (HOU-557). pi's own
 * `AuthStorage.getAuthStatus()` draws the exact same line: a stored credential
 * is `configured`, env / override / fallback are not.
 *
 * ANTHROPIC is the exception: its primary desktop credential is NOT in auth.json
 * at all — the browser login (`claude auth login`) caches it in the shared login
 * dir (Keychain / `.credentials.json`), read only by the `claude` binary. So it
 * counts as connected when EITHER a setup-token was pasted into auth.json (the
 * degraded fallback, `has`) OR the shared-dir credential probe reads logged-in
 * (`anthropicCredentialCached`, warmed by `getAuthStatus`).
 *
 * Pure over its inputs (store + the cached probe) so the rule stays testable.
 */
export function providerConnected(
  store: Pick<AuthStorage, "has">,
  id: string,
): boolean {
  if (id === "anthropic") return store.has(id) || anthropicCredentialCached();
  return store.has(id);
}

export const modelRegistry = ModelRegistry.create(
  authStorage,
  join(config.dataDir, "models.json"),
);
