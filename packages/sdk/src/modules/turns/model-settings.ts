import type { HoustonEngineClient, ProviderId } from "@houston/runtime-client";

/** A per-turn model/effort pick, resolved to its owning provider. */
export interface ModelSettings {
  activeProvider?: ProviderId;
  model?: string;
  effort?: string;
}

/**
 * Resolve a per-turn model/effort pick to a self-consistent provider+model
 * pair (the turn's wire pin — see the turns module `send`; a pick never writes
 * agent settings, HOU-695): the runtime hard-fails `getModel()` on a model id
 * that belongs to a DIFFERENT provider than the one it runs, so a bare
 * `{ model }` pin silently mis-runs (or throws). When a model is given, find
 * its owning provider from the live providers listing and pin BOTH.
 *
 * A model the listing doesn't own (unreachable engine, a dynamic id) passes
 * through as `{ model }` alone — the runtime applies its own default/migration;
 * this never throws (the pick is best-effort, never a hard turn failure here).
 * Effort-only picks (no model) skip the listing entirely.
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
