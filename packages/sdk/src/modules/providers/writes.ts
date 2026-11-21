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
     * @assistant hands: request_provider_connection
     */
    async setApiKey(agentId, provider, key) {
      await ctx.clientFor(agentId).setApiKey(provider, key);
    },
    /**
     * Signs an agent out of an AI provider.
     * @assistant group:providers
     * @assistant hidden: destroys the agent's provider sign-in, including the one serving this conversation.
     * @assistant hands: unreachable signing out is offered on the provider screen the person opens themselves, and no card asks for it.
     */
    async logout(agentId, provider) {
      await ctx.clientFor(agentId).logout(provider);
    },
    /**
     * Sets the AI model an agent uses from now on.
     * @assistant group:providers
     * @assistant hidden: the agent-wide write the model picker owns; setAgentModelChoice is the one to dispatch, and it names the model with the values that exist.
     * @assistant hands: unreachable the same change is setAgentModelChoice, which the assistant makes itself.
     */
    async setModel(agentId, opts) {
      const client = ctx.clientFor(agentId);
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
     * @assistant hands: request_provider_connection
     */
    async setCustomEndpoint(agentId, endpoint) {
      await ctx.clientFor(agentId).setCustomEndpoint(endpoint);
    },
  };
}
