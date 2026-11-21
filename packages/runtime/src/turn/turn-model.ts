import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AZURE_OPENAI, withAzureBaseUrl } from "../ai/azure-openai";
import {
  buildActiveCustomModel,
  OPENAI_COMPATIBLE,
} from "../ai/openai-compatible";
import { providerDefaultModel, safeGetModel } from "../ai/providers";
import { QWEN_PROVIDER_ID, resolveQwenModel } from "../ai/qwen-dashscope";
import { withXiaomiBaseUrl, XIAOMI_PROVIDER_ID } from "../ai/xiaomi-endpoint";

type Settings = { activeProvider?: string; models?: Record<string, string> };

export function resolveTurnModel(
  dataDir: string,
  provider: string,
  override?: string | null,
) {
  if (provider === OPENAI_COMPATIBLE)
    return buildActiveCustomModel(override || undefined, dataDir);
  let settings: Settings = {};
  const f = join(dataDir, "settings.json");
  if (existsSync(f)) {
    try {
      settings = JSON.parse(readFileSync(f, "utf8")) as Settings;
    } catch {
      settings = {};
    }
  }
  const modelId =
    override || settings.models?.[provider] || providerDefaultModel(provider);
  if (provider === QWEN_PROVIDER_ID)
    return resolveQwenModel(modelId, !!override, dataDir);
  if (provider === XIAOMI_PROVIDER_ID)
    return withXiaomiBaseUrl(
      safeGetModel(provider, modelId, !!override),
      dataDir,
    );
  if (provider === AZURE_OPENAI)
    return withAzureBaseUrl(
      safeGetModel(provider, modelId, !!override),
      dataDir,
    );
  return safeGetModel(provider, modelId, !!override);
}
