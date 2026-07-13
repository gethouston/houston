import { listProviders } from "../providers";
import { fetchAnthropicUsage } from "./anthropic";
import { fetchCodexUsage } from "./codex";
import { fetchCopilotUsage } from "./copilot";
import { fetchDeepSeekUsage, fetchOpenRouterUsage } from "./credits";
import type { ProviderUsage } from "./types";

export type {
  ProviderUsage,
  ProviderUsageCredits,
  ProviderUsageStatus,
  ProviderUsageWindow,
  ProviderUsageWindowId,
} from "./types";

/**
 * Account-usage fetchers per provider id. A connected provider with no entry
 * has no usage surface we can read (Gemini, Bedrock, MiniMax, OpenCode, local
 * OpenAI-compatible servers) and reports `unsupported` — an honest row the UI
 * can label, never a silent omission.
 */
const FETCHERS: Record<string, () => Promise<ProviderUsage>> = {
  anthropic: () => fetchAnthropicUsage(),
  "openai-codex": () => fetchCodexUsage(),
  "github-copilot": () => fetchCopilotUsage(),
  openrouter: () => fetchOpenRouterUsage(),
  deepseek: () => fetchDeepSeekUsage(),
};

/**
 * Usage for every CONNECTED provider account, fetched concurrently. One row
 * per connected provider; a fetcher's failure (network, provider outage)
 * lands as that row's `error` status with the reason — one flaky provider
 * never sinks the batch (`GET /providers/usage`).
 */
export async function listProviderUsage(
  providerIds: string[] = connectedProviderIds(),
  fetchers: Record<string, () => Promise<ProviderUsage>> = FETCHERS,
): Promise<ProviderUsage[]> {
  return Promise.all(
    providerIds.map(async (provider): Promise<ProviderUsage> => {
      const fetcher = fetchers[provider];
      if (!fetcher) return { provider, status: "unsupported", windows: [] };
      try {
        return await fetcher();
      } catch (e) {
        return {
          provider,
          status: "error",
          windows: [],
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
}

function connectedProviderIds(): string[] {
  return listProviders()
    .filter((p) => p.configured)
    .map((p) => p.id);
}
