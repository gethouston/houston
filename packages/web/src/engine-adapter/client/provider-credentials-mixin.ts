import type { CustomEndpoint } from "@houston/runtime-client";
import type { TunnelCredentials } from "../../../../../ui/engine-client/src/types";
import { emitEvent } from "../bus";
import * as controlPlane from "../control-plane";
import { credentialSiblings, toNewProvider } from "../synthetic";
import { isHoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { connectApiKey } from "./provider-api-key";
import { pushClaudeCredential } from "./provider-claude-push";
import {
  requireProviderAgentId,
  requireProviderRouting,
} from "./provider-routing";

export function ProviderCredentialsMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProviderCredentials extends Base {
    /** Disconnect a provider account. */
    async providerLogout(name: string): Promise<void> {
      const pid = toNewProvider(name);
      if (!pid) return;
      // Sign-out clears every gateway the connect card represents — for OpenCode
      // that's both Zen and Go, since one key connected both. Clearing a gateway
      // that was never connected is a benign no-op.
      const targets = credentialSiblings(pid);
      if (this.ctx.cp) {
        // Connect-once logout. Clearing only the runtime's local auth.json (what
        // engine.logout does) is NOT enough: the credential also lives in the
        // workspace's CENTRAL store, and the runtime re-pulls it from the host
        // before every turn — so the next message re-hydrated the agent and the
        // provider showed connected again. Forget the central credential FIRST so
        // no in-flight turn can re-serve it, then clear the runtime's local copy.
        // SPACE-VALIDATED id (HOU-979): the raw pref can still name the
        // previous space's agent, and forgetting a credential through a foreign
        // agent's route is a cross-space write. Refuse only while the list is
        // still loading; a settled space with NO agent signs out through the
        // hidden setup runtime, the mirror of how it connected (PRODUCT-1662):
        // the credential is workspace-central, so no agent is needed to forget
        // it, and the setup runtime's own auth copy is cleared alongside.
        requireProviderRouting(this.ctx);
        const agentId = this.ctx.providerAgentId();
        if (!agentId) {
          for (const target of targets) {
            await controlPlane.forgetSetupCredential(this.ctx.cp, target);
            await controlPlane
              .setupRuntimeClientFor(this.ctx.cp)
              .logout(target);
          }
          return;
        }
        for (const target of targets) {
          await controlPlane.forgetCredential(this.ctx.cp, agentId, target);
          await controlPlane
            .runtimeClientFor(this.ctx.cp, agentId)
            .logout(target);
        }
        return;
      }
      for (const target of targets) {
        await this.ctx.engine.logout(target);
      }
    }

    /**
     * Push a desktop-extracted Anthropic OAuth credential to this space's pod
     * (or, with no settled agent, its setup runtime). See `provider-claude-push`
     * for the target-resolution rule.
     */
    async pushClaudeOAuthCredential(credentialJson: string): Promise<void> {
      await pushClaudeCredential(this.ctx, credentialJson);
    }

    /**
     * Connect an API-key provider by pasted key — see {@link connectApiKey} for
     * the whole flow (sibling gateways, the pre-agent setup path, the active
     * provider claim, and the completion event).
     */
    async setProviderApiKey(
      name: string,
      apiKey: string,
      endpoint?: string,
    ): Promise<void> {
      await connectApiKey(this.ctx, name, apiKey, endpoint);
    }

    /**
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
        // Space-validated, like every other provider write (HOU-979). Unlike
        // the credential writes this one has NO pre-agent path: the endpoint
        // is per-runtime state and the setup runtime dies with the first
        // agent's creation, so a zero-agent space is the typed expected
        // state the app turns into "create an agent first" (PRODUCT-1662).
        const agentId = requireProviderAgentId(this.ctx);
        await controlPlane.setCustomEndpoint(this.ctx.cp, agentId, endpoint);
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

    /**
     * Mint a relay credential for the guided "connect a local model" flow: the
     * desktop tunnels the user's local model server up to their CLOUD agent (see
     * control-plane.getTunnelCredentials).
     *
     * Returns `null` when THIS deployment has no relay to tunnel through —
     * no gateway at all (local/self-host: the engine is co-located, no tunnel
     * is needed), a gateway without the tunnels route (404), or one whose
     * relay is explicitly unconfigured (the 503 "tunnel relay not
     * configured"). `null` tells the connect flow to register the detected
     * server DIRECTLY; the engine's save-time validation stays the authority
     * on whether a localhost endpoint is acceptable. Anything else (auth,
     * transient outage) still throws — a relay that exists but errored must
     * surface, never silently downgrade to a direct endpoint.
     */
    async getTunnelCredentials(): Promise<TunnelCredentials | null> {
      if (!this.ctx.cp) return null;
      try {
        return await controlPlane.getTunnelCredentials(this.ctx.cp);
      } catch (err) {
        if (
          isHoustonEngineError(err) &&
          (err.status === 404 ||
            (err.status === 503 &&
              err.message.includes("relay not configured")))
        ) {
          return null;
        }
        throw err;
      }
    }
  }
  return ProviderCredentials;
}
