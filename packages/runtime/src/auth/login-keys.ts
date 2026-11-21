import {
  AZURE_OPENAI,
  normalizeAzureEndpoint,
  setAzureEndpoint,
} from "../ai/azure-openai";
import {
  type CustomEndpointInput,
  OPENAI_COMPATIBLE,
  setCustomEndpointConfig,
} from "../ai/openai-compatible";
import {
  isProvider,
  type ProviderId,
  providerAuthMethod,
} from "../ai/providers";
import { active, activeKey, clearLoginExpiry } from "./login-state";
import { authStorage } from "./storage";

const known = (id: string): id is ProviderId => isProvider(id);

export function setApiKey(
  providerId: string,
  key: string,
  endpoint?: string,
): void {
  const trimmed = assertApiKeyConnectable(providerId, key, endpoint);
  if (providerId === AZURE_OPENAI) setAzureEndpoint(endpoint ?? "");
  authStorage.set(providerId, { type: "api_key", key: trimmed });
  const slot = activeKey(providerId as ProviderId);
  const state = active.get(slot);
  if (state) clearLoginExpiry(state);
  active.delete(slot);
}

export function assertApiKeyConnectable(
  providerId: string,
  key: string,
  endpoint?: string,
) {
  if (!known(providerId)) throw new Error(`unknown provider: ${providerId}`);
  if (providerAuthMethod(providerId) !== "apiKey")
    throw new Error(`${providerId} does not connect with a pasted API key`);
  const trimmed = key.trim();
  if (!trimmed) throw new Error("missing API key");
  if (providerId === AZURE_OPENAI) normalizeAzureEndpoint(endpoint ?? "");
  return trimmed;
}

export const LOCAL_PLACEHOLDER_KEY = "houston-local";

export function setCustomEndpoint(
  input: CustomEndpointInput & { apiKey?: string },
): void {
  setCustomEndpointConfig(input);
  const key = input.apiKey?.trim() || LOCAL_PLACEHOLDER_KEY;
  authStorage.set(OPENAI_COMPATIBLE, { type: "api_key", key });
}
