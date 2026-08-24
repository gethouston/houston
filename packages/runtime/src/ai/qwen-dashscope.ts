import type { Model } from "@earendil-works/pi-ai";
import { QWEN_TOKEN_PLAN_MODELS } from "@earendil-works/pi-ai/providers/qwen-token-plan.models";
import { config } from "../config";
import { activeQwenRegion, setQwenRegionIn } from "./qwen-region";

/**
 * Houston's `qwen` extension provider: Qwen models on Alibaba Model Studio's
 * INTERNATIONAL pay-as-you-go API (DashScope, OpenAI-compatible). pi-ai ships
 * only the Token Plan gateways (`qwen-token-plan*`), whose endpoint rejects
 * every key but the dedicated one minted after purchasing a plan — a regular
 * (free-quota) Model Studio key gets a 401 (HOU-1077). This provider is the
 * home for those regular keys.
 *
 * Model Studio international is REGION-SCOPED: a key works only against the
 * region it was created in (verified live — a US-Virginia key answers
 * `invalid_api_key` on the Singapore endpoint and authenticates on the US
 * one). Houston hides that from the user: the verify probe tries each region
 * (`auth/qwen-verify.ts`) and the accepting one is persisted per data dir
 * (`qwen-region.json`, riding the same sync as settings.json), which every
 * model read below then serves.
 *
 * The model list is DERIVED from pi's own `qwen-token-plan` catalog (the same
 * Model Studio catalog backs both products) — Qwen-family entries only, with
 * the provider id and base URL remapped — so a pi bump that updates Qwen
 * models updates this provider in lockstep, and the compat/thinking flags can
 * never drift from pi's.
 *
 * Delete this module (with `auth/qwen-verify.ts` and the host twin,
 * `packages/host/src/providers/qwen-dashscope.ts`) when pi-ai ships a
 * DashScope provider natively.
 *
 * pi-ai has no registry hook for a NEW provider id (its `MODELS` table is not
 * exported), so the extension threads through Houston's own catalog seams
 * instead of a monkey-patch: `pi-catalog.ts` (provider/model ids),
 * `providers.ts` `safeGetModel` + `turn/turn-model.ts` (model resolution), and
 * `ModelRuntime.registerProvider` (stream dispatch + stored-key auth — the
 * same mechanism the local OpenAI-compatible provider uses).
 */

export const QWEN_PROVIDER_ID = "qwen";

/** The default model, listed FIRST so `firstCatalogModel` picks it. */
const QWEN_DEFAULT_MODEL = "qwen3.7-max";

// Region persistence lives in ./qwen-region; existing importers keep this
// module as the provider's one front door.
export {
  activeQwenRegion,
  QWEN_REGIONS,
  type QwenRegion,
  qwenRegionFileIn,
  setQwenRegionIn,
} from "./qwen-region";

/**
 * Persist the region a key just verified against and re-register the live
 * runtime so the very next turn dials it (the registered config is merged,
 * but the MODEL objects carry the live base URL — see `qwenModels`).
 */
export function setQwenRegion(regionId: string): void {
  setQwenRegionIn(config.dataDir, regionId);
  if (liveRegistrar) registerQwenProvider(liveRegistrar);
}

/**
 * The provider's models: pi's Token Plan Qwen entries on the active region's
 * DashScope URL. Derived per call (the list is 5 tiny objects) so a region
 * change is never served stale.
 */
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

/** Model lookup, `undefined` for an id the provider doesn't offer. */
export function qwenModel(
  id: string,
  dataDir?: string,
): Model<"openai-completions"> | undefined {
  return qwenModels(dataDir).find((m) => m.id === id);
}

/**
 * `safeGetModel` semantics for a per-turn data dir (turn/turn-model.ts): a
 * pinned id must exist, a stale saved id falls back to the default with a
 * logged diagnostic — with every model carrying THIS dir's region URL.
 */
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

/**
 * The slice of `ModelRuntime` this registration takes (mirrors
 * `CustomProviderRegistrar` in ./openai-compatible — test-injectable).
 */
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

/** The long-lived runtime, re-registered when the verified region changes. */
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

/**
 * Register the provider on a runtime so pi can dispatch its streams (pi 0.82+
 * dispatches strictly by registered provider id) and resolve its stored API
 * key (HoustonAuthStore, keyed by provider id — the same path the local
 * provider's key rides). Boot (auth/storage.ts) binds the long-lived runtime
 * so a region change re-registers it; the throwaway cloud runtime registers
 * per turn with its hydrated data dir (turn/turn-session.ts).
 */
export function ensureQwenRuntimeProvider(
  runtime: QwenProviderRegistrar,
  dataDir?: string,
): void {
  registerQwenProvider(runtime, dataDir);
  if (dataDir === undefined) liveRegistrar = runtime;
}
