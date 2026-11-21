import type { HoustonEngineClient, ProviderId } from "@houston/runtime-client";

export interface ModelSettings {
  activeProvider?: ProviderId;
  model?: string;
  effort?: string;
  mode?: "execute" | "plan" | "auto";
}

export async function resolveModelSettings(
  client: HoustonEngineClient,
  model: string | undefined,
  effort: string | undefined,
  mode: "execute" | "plan" | "auto" | undefined,
): Promise<ModelSettings> {
  if (model === undefined) return { effort, mode };
  let activeProvider: ProviderId | undefined;
  try {
    const providers = await client.listProviders();
    activeProvider = providers.find(
      (p) => p.activeModel === model || p.models.includes(model),
    )?.id;
  } catch {}
  return { activeProvider, model, effort, mode };
}
