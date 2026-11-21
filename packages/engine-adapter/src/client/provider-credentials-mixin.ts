import type { CustomEndpoint } from "@houston/runtime-client";
import { emitEvent } from "../bus";
import * as controlPlane from "../control-plane";
import { credentialSiblings, toNewProvider } from "../synthetic";
import { localModelBridgeAccess } from "./local-model-bridge";
import type { BaseCtor } from "./mixin";
import { connectApiKey } from "./provider-api-key";
import { pushClaudeCredential } from "./provider-claude-push";
import {
  requireProviderAgentId,
  requireProviderRouting,
} from "./provider-routing";
import { viaSdk } from "./sdk-error";

export function ProviderCredentialsMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProviderCredentials extends Base {
    getLocalModelBridgeAccess(userId: string, agentId: string | null) {
      return localModelBridgeAccess(this.ctx, userId, agentId);
    }
    /**
     * Signs the workspace out of an AI provider.
     *
     * @assistant group:providers
     * @assistant hidden: destroys the provider sign-in every agent runs on, including the one serving this conversation.
     * @assistant hands: unreachable signing out is offered on the provider screen the person opens themselves, and no card asks for it.
     */
    async providerLogout(name: string): Promise<void> {
      const pid = toNewProvider(name);
      if (!pid) return;
      const targets = credentialSiblings(pid);
      const cp = this.ctx.cp;
      if (cp) {
        requireProviderRouting(this.ctx);
        const agentId = this.ctx.providerAgentId();
        const credentials = this.ctx.sdk.providers.credentials;
        for (const target of targets) {
          if (agentId) {
            await viaSdk(
              `${controlPlane.agentPath(agentId)}/credential/forget`,
              () => credentials.forgetCredential(agentId, target),
            );
            await controlPlane.runtimeClientFor(cp, agentId).logout(target);
          } else {
            await viaSdk("/setup-runtime/credential/forget", () =>
              credentials.forgetSetupCredential(target),
            );
            await controlPlane.setupRuntimeClientFor(cp).logout(target);
          }
        }
      } else {
        for (const target of targets) {
          await this.ctx.engine.logout(target);
        }
      }
      emitEvent("ProviderLoginComplete", {
        provider: name,
        success: false,
        error: null,
      });
    }

    async pushClaudeOAuthCredential(credentialJson: string): Promise<void> {
      await pushClaudeCredential(this.ctx, credentialJson);
    }

    async setProviderApiKey(
      name: string,
      apiKey: string,
      endpoint?: string,
    ): Promise<void> {
      await connectApiKey(this.ctx, name, apiKey, endpoint);
    }

    /**
     * Connects an agent to a self-hosted, OpenAI-compatible model server.
     *
     * @assistant group:providers
     * @assistant hidden: takes the key that server is reached with, and a credential must never pass through a chat turn.
     * @assistant hands: request_provider_connection
     *
     * Connect an OpenAI-compatible (local) server: persist the base URL + model
     * and CLAIM it as active (first connect on a fresh agent only — a connect
     * never moves an agent that already has a provider, HOU-695), then fire
     * `ProviderLoginComplete` like the other connect paths. LOCAL/desktop only —
     * in cloud the host refuses (the openaiCompatible capability is off), so the
     * error surfaces to the dialog. Settings are PER-AGENT on the host, so the
     * claim MUST go through the agent's runtime client (mirrors setProviderApiKey).
     */
    async setProviderCustomEndpoint(endpoint: CustomEndpoint): Promise<void> {
      if (this.ctx.cp) {
        const agentId = requireProviderAgentId(this.ctx);
        await viaSdk(
          `${controlPlane.agentPath(agentId)}/provider/openai-compatible`,
          () =>
            this.ctx.sdk.providers.credentials.setCustomEndpoint(
              agentId,
              endpoint,
            ),
        );
        await controlPlane
          .runtimeClientFor(this.ctx.cp, agentId)
          .claimActiveProvider("openai-compatible");
      } else {
        await this.ctx.engine.setCustomEndpoint(endpoint);
        await this.ctx.engine.claimActiveProvider("openai-compatible");
      }
      emitEvent("ProviderLoginComplete", {
        provider: "openai-compatible",
        success: true,
        error: null,
      });
    }
  }
  return ProviderCredentials;
}
