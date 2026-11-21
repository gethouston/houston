import { toCanonicalProviderId } from "@houston/domain/provider-dialect";

export const DROP_PI_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "ant-ling",
  "kimi-coding",
  "moonshotai-cn",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-sgp",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
]);

export const REGIONAL_SUFFIX = /-(cn|sgp|ams)$/;

export function isHiddenProviderId(
  id: string,
  piKnows: (candidate: string) => boolean,
): boolean {
  const canonical = toCanonicalProviderId(id);
  if (DROP_PI_PROVIDERS.has(canonical)) return true;
  const parent = canonical.replace(REGIONAL_SUFFIX, "");
  if (parent === canonical) return false;
  return piKnows(parent) && !DROP_PI_PROVIDERS.has(parent);
}
