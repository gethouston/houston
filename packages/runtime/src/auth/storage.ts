import { join } from "node:path";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { bindCustomProviderRegistrar } from "../ai/openai-compatible";
import { ensureQwenRuntimeProvider } from "../ai/qwen-dashscope";
import { anthropicCredentialCached } from "../backends/claude/credential-status";
import { config } from "../config";
import { HoustonAuthStore } from "./credential-store";

export const authStorage = new HoustonAuthStore(
  join(config.dataDir, "auth.json"),
);

export type StoredCredential =
  | { type: "oauth"; refresh?: string; expires?: number }
  | { type: "api_key" }
  | { type: string };

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

export const modelRuntime = await ModelRuntime.create({
  credentials: authStorage,
  modelsPath: join(config.dataDir, "models.json"),
});

bindCustomProviderRegistrar(modelRuntime);

ensureQwenRuntimeProvider(modelRuntime);

export const modelRegistry = new ModelRegistry(modelRuntime);

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
