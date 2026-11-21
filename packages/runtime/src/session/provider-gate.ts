import {
  activeProvider,
  type ProviderId,
  providerConfigured,
} from "../ai/providers";
import { anthropicCredentialSettled } from "../backends/claude/credential-status";

const ANTHROPIC = "anthropic";

export async function pinnedProviderUnavailable(
  provider: ProviderId,
): Promise<boolean> {
  if (providerConfigured(provider)) return false;
  if (provider !== ANTHROPIC) return true;
  return (await anthropicCredentialSettled()) === false;
}

export async function connectedProviderForTurn(): Promise<ProviderId | null> {
  const provider = activeProvider();
  if (provider) return provider;
  await anthropicCredentialSettled();
  return activeProvider();
}
