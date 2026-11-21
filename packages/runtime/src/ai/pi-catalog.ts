import type { Api, Model, Provider } from "@earendil-works/pi-ai";
import {
  type BuiltinProvider,
  getModels,
  getProviders,
} from "@earendil-works/pi-ai/compat";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { QWEN_PROVIDER_ID, qwenModels } from "./qwen-dashscope";

let cachedBuiltins: readonly Provider[] | undefined;
function piBuiltinProviders(): readonly Provider[] {
  cachedBuiltins ??= builtinProviders();
  return cachedBuiltins;
}

export function piProviderIds(): string[] {
  return [...(getProviders() as string[]), QWEN_PROVIDER_ID];
}

export function isPiProvider(id: string): boolean {
  return piProviderIds().includes(id);
}

export function isPiOAuthProvider(id: string): boolean {
  return piBuiltinProviders().some(
    (p) => p.id === id && p.auth.oauth !== undefined && !p.auth.apiKey,
  );
}

export function piApiKeyProviderIds(): string[] {
  return piProviderIds().filter((id) => !isPiOAuthProvider(id));
}

export function piModelIds(id: string): string[] {
  if (id === QWEN_PROVIDER_ID) return qwenModels().map((m) => m.id);
  try {
    return getModels(id as BuiltinProvider).map((m: Model<Api>) => m.id);
  } catch {
    return [];
  }
}
