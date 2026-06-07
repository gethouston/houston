/**
 * Device-local provider credentials live on the sidecar engine only.
 * Cloud agents have their own engine; Settings and onboarding must never
 * route credential reads/writes through `resolveEngine(currentAgent())`.
 */

import type { ProviderStatus as EngineProviderStatus } from "@houston-ai/engine-client";
import { getEngine } from "./engine";
import type { ProviderStatus } from "./tauri";

function mapProviderStatus(p: EngineProviderStatus): ProviderStatus {
  return {
    provider: p.provider,
    cli_installed: p.cliInstalled,
    auth_state: p.authState,
    authenticated: p.authState === "authenticated",
    cli_name: p.cliName,
  };
}

export async function checkLocalProviderStatus(provider: string): Promise<ProviderStatus> {
  const p = await getEngine().providerStatus(provider);
  return mapProviderStatus(p);
}

export async function saveLocalProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  const engine = getEngine();
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

export async function launchLocalProviderLogin(
  provider: string,
  opts?: { deviceAuth?: boolean },
): Promise<void> {
  await getEngine().providerLogin(provider, opts);
}

export async function launchLocalProviderLogout(provider: string): Promise<void> {
  await getEngine().providerLogout(provider);
}

export async function cancelLocalProviderLogin(provider: string): Promise<void> {
  await getEngine().cancelProviderLogin(provider);
}
