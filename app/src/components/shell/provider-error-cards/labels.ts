import { modelDisplayLabel } from "../../../lib/model-labels.ts";
import { getProvider } from "../../../lib/providers.ts";

export { providerName as providerLabel } from "../../../lib/providers.ts";

export function providerErrorModelLabel(
  provider: string,
  model: string,
): string {
  return modelDisplayLabel(provider, model) ?? model;
}

export function statusPageUrl(provider: string): string | null {
  switch (getProvider(provider)?.id ?? provider) {
    case "anthropic":
      return "https://status.anthropic.com/";
    case "openai":
      return "https://status.openai.com/";
    case "google":
      return "https://status.cloud.google.com/";
    case "github-copilot":
      return "https://www.githubstatus.com/";
    default:
      return null;
  }
}
