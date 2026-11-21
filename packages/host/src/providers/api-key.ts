import { getProviders } from "@earendil-works/pi-ai/compat";
import { piOAuthProviders } from "./pi-oauth";
import { QWEN_PROVIDER_ID } from "./qwen-dashscope";

const PI_PROVIDER_IDS: ReadonlySet<string> = new Set<string>([
  ...getProviders(),
  QWEN_PROVIDER_ID,
]);

const PI_OAUTH_IDS: ReadonlySet<string> = new Set(
  piOAuthProviders().map((p) => p.id),
);

export function isApiKeyProvider(id: string): boolean {
  return PI_PROVIDER_IDS.has(id) && !PI_OAUTH_IDS.has(id);
}
