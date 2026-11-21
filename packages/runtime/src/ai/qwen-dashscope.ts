import type { Model } from "@earendil-works/pi-ai";
import { QWEN_TOKEN_PLAN_MODELS } from "@earendil-works/pi-ai/providers/qwen-token-plan.models";
import { config } from "../config";
import { activeQwenRegion, setQwenRegionIn } from "./qwen-region";

export const QWEN_PROVIDER_ID = "qwen";

const QWEN_DEFAULT_MODEL = "qwen3.7-max";

export {
  activeQwenRegion,
  QWEN_REGIONS,
  type QwenRegion,
  qwenRegionFileIn,
  setQwenRegionIn,
} from "./qwen-region";

export function setQwenRegion(regionId: string): void {
  setQwenRegionIn(config.dataDir, regionId);
  if (liveRegistrar) registerQwenProvider(liveRegistrar);
}

export function qwenModels(
  dataDir: string = config.dataDir,
): Model<"openai-completions">[] {
  const { baseUrl } = activeQwenRegion(dataDir);
  const qwen = Object.values(
    QWEN_TOKEN_PLAN_MODELS as Record<string, Model<"openai-completions">>,
  )
    .filter((m) => m.id.startsWith("qwen"))
    .map((m) => ({ ...m, provider: QWEN_PROVIDER_ID, baseUrl }));
  return [
    ...qwen.filter((m) => m.id === QWEN_DEFAULT_MODEL),
    ...qwen.filter((m) => m.id !== QWEN_DEFAULT_MODEL),
  ];
}

export function qwenModel(
  id: string,
  dataDir?: string,
): Model<"openai-completions"> | undefined {
  return qwenModels(dataDir).find((m) => m.id === id);
}

export function resolveQwenModel(
  modelId: string,
  pinned: boolean,
  dataDir: string,
): Model<"openai-completions"> {
  const m = qwenModel(modelId, dataDir);
  if (m) return m;
  if (pinned)
    throw new Error(`${QWEN_PROVIDER_ID} model "${modelId}" is not available`);
  console.warn(
    `[providers] ${QWEN_PROVIDER_ID} model "${modelId}" is not offered; ` +
      `falling back to "${QWEN_DEFAULT_MODEL}"`,
  );
  return qwenModel(QWEN_DEFAULT_MODEL, dataDir) as Model<"openai-completions">;
}

export interface QwenProviderRegistrar {
  registerProvider(
    providerId: string,
    config: {
      name?: string;
      baseUrl?: string;
      api?: "openai-completions";
      models?: Model<"openai-completions">[];
    },
  ): void;
}

let liveRegistrar: QwenProviderRegistrar | undefined;

function registerQwenProvider(
  runtime: QwenProviderRegistrar,
  dataDir?: string,
): void {
  runtime.registerProvider(QWEN_PROVIDER_ID, {
    name: "Qwen",
    baseUrl: activeQwenRegion(dataDir).baseUrl,
    api: "openai-completions",
    models: qwenModels(dataDir),
  });
}

export function ensureQwenRuntimeProvider(
  runtime: QwenProviderRegistrar,
  dataDir?: string,
): void {
  registerQwenProvider(runtime, dataDir);
  if (dataDir === undefined) liveRegistrar = runtime;
}
