import { join } from "node:path";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { bindCustomProviderRegistrar } from "../ai/openai-compatible";
import { anthropicCredentialCached } from "../backends/claude/credential-status";
import { config } from "../config";
import { HoustonAuthStore } from "./credential-store";

/**
 * Single-user credential store, persisted to dataDir/auth.json (mode 0600).
 * Houston-owned (see credential-store.ts): pi's `ModelRuntime` runs OAuth
 * refresh through its serialized `modify`, so all agent sessions transparently
 * use the current subscription token.
 */
export const authStorage = new HoustonAuthStore(
  join(config.dataDir, "auth.json"),
);

/**
 * The stored-credential shapes `credentialUsable` can judge — pi's
 * `Credential` union, structurally (an OAuth token or a plain API key).
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
 * Deliberately the stored entry only, NOT pi's resolved auth. Resolved auth
 * ALSO covers an ambient env var (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, …),
 * a CLI `--api-key` override, or a models.json fallback. Those can make a model
 * callable, but none is a connection the user made through Houston, and none is
 * something "Sign out" can clear — so counting them leaves the provider stuck
 * "connected" forever and the logout button does nothing (HOU-557). pi's own
 * `getProviderAuthStatus()` draws the exact same line: a stored credential
 * is `configured: "stored"`, env / override / fallback are not.
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
  store: Pick<HoustonAuthStore, "get">,
  id: string,
): boolean {
  const usable = credentialUsable(
    store.get(id) as StoredCredential | undefined,
  );
  if (id === "anthropic") return usable || anthropicCredentialCached();
  return usable;
}

/**
 * The canonical model/auth runtime over Houston's credential store. Owns
 * provider composition (builtins + models.json), auth resolution (stored
 * credential + ambient env), OAuth login/refresh, and request dispatch —
 * every agent session streams through it (`createAgentSession({ modelRuntime })`).
 *
 * Created without network access (`allowModelNetwork` defaults false), so boot
 * stays offline and deterministic like the old sync registry.
 */
export const modelRuntime = await ModelRuntime.create({
  credentials: authStorage,
  modelsPath: join(config.dataDir, "models.json"),
});

// The local OpenAI-compatible endpoint streams through the runtime like every
// other provider, so its provider id must be registered whenever an endpoint
// is configured (pi 0.82 dispatches strictly by registered provider id).
// Binding also re-syncs the registration on every later endpoint write.
bindCustomProviderRegistrar(modelRuntime);

/** Sync compatibility facade over the runtime (pi's extension-facing API). */
export const modelRegistry = new ModelRegistry(modelRuntime);

/**
 * The slice of credential access the usage/balance probes take — injectable so
 * their tests drive it with fixtures. `getApiKey` resolves through the runtime
 * (auto-refreshing OAuth under the store's serialized modify), replacing the
 * old `AuthStorage.getApiKey`.
 */
export interface KeyStore {
  has(providerId: string): boolean;
  get(providerId: string): ReturnType<HoustonAuthStore["get"]>;
  getApiKey(providerId: string): Promise<string | undefined>;
}

export const keyStore: KeyStore = {
  has: (id) => authStorage.has(id),
  get: (id) => authStorage.get(id),
  getApiKey: async (id) => (await modelRuntime.getAuth(id))?.auth.apiKey,
};
