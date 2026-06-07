/**
 * Provider API-key connect. Keys are stored under ~/.houston/providers/ on
 * the local sidecar unless `target` is `activeAgent` (cloud reconnect flows).
 */
import type { HoustonClient } from "@houston-ai/engine-client";
import type { ProviderInfo } from "./providers.ts";

export type ProviderCredentialSaveTarget = "local" | "activeAgent";

export const MIN_PROVIDER_API_KEY_LENGTH = 20;

/** CLI OAuth primary with optional API-key advanced section (Anthropic, OpenAI). */
export function isDualPathConnectProvider(
  provider: ProviderInfo | null | undefined,
): boolean {
  return provider?.loginKind === "oauth";
}

/** API-key paste flow without a CLI OAuth path (OpenRouter today). */
export function isApiKeyOnlyProvider(provider: ProviderInfo | null | undefined): boolean {
  return provider?.loginKind === "apiKey";
}

/** Whether `saveProviderApiKey` is wired for this provider today. */
export function supportsProviderApiKeySave(providerId: string): boolean {
  switch (providerId) {
    case "openrouter":
    case "anthropic":
    case "openai":
      return true;
    default:
      return false;
  }
}

/** Reconnect / error cards may offer API-key connect when a console URL exists. */
export function providerSupportsApiKeyConnect(
  provider: ProviderInfo | null | undefined,
): boolean {
  if (!provider) return false;
  if (isApiKeyOnlyProvider(provider)) return true;
  return isDualPathConnectProvider(provider) && !!provider.apiKeyConsoleUrl;
}

async function saveProviderApiKeyOnEngine(
  engine: HoustonClient,
  providerId: string,
  apiKey: string,
): Promise<void> {
  switch (providerId) {
    case "openrouter":
      await engine.setOpenRouterApiKey(apiKey);
      return;
    case "anthropic":
      await engine.setAnthropicApiKey(apiKey);
      return;
    case "openai":
      await engine.setOpenAiApiKey(apiKey);
      return;
    default:
      throw new Error(`Provider "${providerId}" does not support API key connect`);
  }
}

/** Settings/onboarding default to `local`; chat reconnect uses `activeAgent`. */
export async function saveProviderApiKey(
  providerId: string,
  apiKey: string,
  target: ProviderCredentialSaveTarget = "local",
): Promise<void> {
  if (target === "local") {
    const { saveLocalProviderApiKey } = await import("./local-provider-bridge.ts");
    await saveLocalProviderApiKey(providerId, apiKey);
    return;
  }
  const { currentAgent } = await import("./agent-lookup.ts");
  const { resolveEngine } = await import("./engine-for-agent.ts");
  const engine = await resolveEngine(currentAgent());
  await saveProviderApiKeyOnEngine(engine, providerId, apiKey);
}
