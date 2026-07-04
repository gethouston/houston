import type { HoustonEngineClient, ProviderId } from "@houston/runtime-client";

/** The settings write for a per-turn model/effort switch. */
export interface ModelSettings {
  activeProvider?: ProviderId;
  model?: string;
  effort?: string;
}

/**
 * Resolve the `setSettings` write for a per-turn model/effort switch, mirroring
 * the web adapter's `setAgentConfig`: the runtime resolves the model from its
 * OWN active provider and hard-fails `getModel()` on a model id that belongs to
 * a DIFFERENT provider, so a bare `{ model }` write silently mis-runs (or throws
 * the next turn). When a model is given, find its owning provider from the live
 * providers listing and send BOTH `activeProvider` + `model`, so the pick is
 * self-consistent whatever was active before.
 *
 * A model the listing doesn't own (unreachable engine, a dynamic id) passes
 * through as `{ model }` alone — the runtime applies its own default/migration;
 * this never throws (the pick is best-effort, never a hard turn failure here).
 * Effort-only writes (no model) skip the listing entirely.
 */
export async function resolveModelSettings(
  client: HoustonEngineClient,
  model: string | undefined,
  effort: string | undefined,
): Promise<ModelSettings> {
  if (model === undefined) return { effort };
  let activeProvider: ProviderId | undefined;
  try {
    const providers = await client.listProviders();
    activeProvider = providers.find(
      (p) => p.activeModel === model || p.models.includes(model),
    )?.id;
  } catch {
    // Engine unreachable / no provider selected: fall through to a bare model
    // write. The runtime settles the provider on its side.
  }
  return { activeProvider, model, effort };
}
