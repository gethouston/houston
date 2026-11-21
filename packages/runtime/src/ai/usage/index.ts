import { listProviders } from "../providers";
import { fetchAnthropicUsage } from "./anthropic";
import { fetchCodexUsage } from "./codex";
import { fetchCopilotUsage } from "./copilot";
import { fetchDeepSeekUsage, fetchOpenRouterUsage } from "./credits";
import { readTokenSpend } from "./ledger";
import type { ProviderUsage } from "./types";

export { readTokenSpend, recordTokenSpend } from "./ledger";
export type {
  ProviderUsage,
  ProviderUsageCredits,
  ProviderUsageStatus,
  ProviderUsageTokens,
  ProviderUsageWindow,
  ProviderUsageWindowId,
} from "./types";

const FETCHERS: Record<string, () => Promise<ProviderUsage>> = {
  anthropic: () => fetchAnthropicUsage(),
  "openai-codex": () => fetchCodexUsage(),
  "github-copilot": () => fetchCopilotUsage(),
  openrouter: () => fetchOpenRouterUsage(),
  deepseek: () => fetchDeepSeekUsage(),
};

export async function listProviderUsage(
  providerIds: string[] = connectedProviderIds(),
  fetchers: Record<string, () => Promise<ProviderUsage>> = FETCHERS,
  readSpend: typeof readTokenSpend = readTokenSpend,
): Promise<ProviderUsage[]> {
  return Promise.all(
    providerIds.map(async (provider): Promise<ProviderUsage> => {
      const fetcher = fetchers[provider];
      if (!fetcher) {
        const tokens = readSpend(provider);
        return tokens
          ? {
              provider,
              status: "ok",
              windows: [],
              tokens,
              fetchedAt: new Date().toISOString(),
            }
          : { provider, status: "unsupported", windows: [] };
      }
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
