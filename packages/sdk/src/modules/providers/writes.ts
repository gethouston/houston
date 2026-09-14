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
    /**
     * Shows which AI provider an agent is signed in to right now.
     * @assistant group:providers
     * @assistant hidden: the no-refetch primitive behind refreshStatus, which is the one to dispatch; both read the same sign-in.
     */
    status(agentId) {
      return ctx.clientFor(agentId).authStatus();
    },
    /**
     * Saves an AI provider's API key for an agent.
     * @assistant group:providers
     * @assistant hidden: takes a provider credential the person pastes; a key must never pass through a chat turn.
     */
    async setApiKey(agentId, provider, key) {
      await ctx.clientFor(agentId).setApiKey(provider, key);
    },
    /**
     * Signs an agent out of an AI provider.
     * @assistant group:providers
     * @assistant hidden: destroys the agent's provider sign-in, including the one serving this conversation.
     */
    async logout(agentId, provider) {
      await ctx.clientFor(agentId).logout(provider);
    },
    /**
     * Sets the AI model an agent uses from now on.
     * @assistant group:providers
     * @assistant hidden: the agent-wide write the model picker owns; setAgentModelChoice is the one to dispatch, and it names the model with the values that exist.
     */
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
    /**
     * Connects an agent to a self-hosted, OpenAI-compatible model server.
     * @assistant group:providers
     * @assistant hidden: takes the key that server is reached with, and a credential must never pass through a chat turn.
     */
    async setCustomEndpoint(agentId, endpoint) {
      await ctx.clientFor(agentId).setCustomEndpoint(endpoint);
    },
  };
}
