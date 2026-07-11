/**
 * The providers module's no-refetch writes ({@link ProvidersWrites}) — the
 * per-agent-pod runtime calls surfaced WITHOUT the post-write snapshot refresh
 * the {@link ProviderOps} facade does, for a host that owns its own read model
 * (the web engine-adapter under `reactivity:false`).
 *
 * These are the write PRIMITIVES: the refetching facade ops (`operations.ts`)
 * delegate their credential writes here and then call `refresh()`, so there is
 * one implementation of each underlying call and the two never drift.
 * `setCustomEndpoint` has no refetching sibling — it is exposed only here.
 */

import type { ModuleContext } from "../../module-context";
import { resolveModelSettings } from "../turns/model-settings";
import type { ProvidersWrites } from "./types";

export function createProviderWrites(ctx: ModuleContext): ProvidersWrites {
  return {
    status(agentId) {
      return ctx.clientFor(agentId).authStatus();
    },
    async setApiKey(agentId, provider, key) {
      await ctx.clientFor(agentId).setApiKey(provider, key);
    },
    async logout(agentId, provider) {
      await ctx.clientFor(agentId).logout(provider);
    },
    async setModel(agentId, opts) {
      const client = ctx.clientFor(agentId);
      // Reuse the shared resolver: it pairs a model with its owning provider (the
      // runtime hard-fails a model that belongs to a different active provider).
      // `mode` is a per-turn pin only — never an agent-wide setting (HOU-695) —
      // so a settings write always resolves it as undefined.
      const settings = await resolveModelSettings(
        client,
        opts.model,
        opts.effort,
        undefined,
      );
      if (opts.provider !== undefined) settings.activeProvider = opts.provider;
      await client.setSettings(settings);
    },
    async setCustomEndpoint(agentId, endpoint) {
      await ctx.clientFor(agentId).setCustomEndpoint(endpoint);
    },
  };
}
