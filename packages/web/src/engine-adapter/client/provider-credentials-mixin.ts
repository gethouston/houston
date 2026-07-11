import type { CustomEndpoint } from "@houston/runtime-client";
import type { TunnelCredentials } from "../../../../../ui/engine-client/src/types";
import { emitEvent } from "../bus";
import * as controlPlane from "../control-plane";
import { credentialSiblings, toNewProvider } from "../synthetic";
import type { BaseCtor } from "./mixin";

export function ProviderCredentialsMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProviderCredentials extends Base {
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
        const agentId = this.ctx.requireAgentId();
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
     * Push a desktop-extracted Anthropic OAuth credential (the `claude` CLI's
     * `.credentials.json` JSON) to the given agent's pod, which stores + materializes
     * it on the PVC. The desktop calls this for a REMOTE engine after a successful
     * browser login — the pod can't read this machine's Keychain. Cloud-only:
     * a co-located engine shares the credential dir with its local runtime, so it
     * never reaches here (a call without a control plane is a programming error).
     */
    async pushClaudeOAuthCredential(
      agentId: string,
      credentialJson: string,
    ): Promise<void> {
      if (!this.ctx.cp) {
        throw new Error("Pushing a Claude credential needs a cloud engine.");
      }
      await controlPlane.pushClaudeOAuthCredential(
        this.ctx.cp,
        agentId,
        credentialJson,
      );
    }

    /**
     * Connect an API-key provider (OpenCode Zen / Go): the user pastes a key, no
     * OAuth dance. Cloud stores it centrally (and pushes it into the agent runtime)
     * via the control plane; local writes it straight to the single runtime. On
     * success we fire `ProviderLoginComplete` so the connect dialog closes and the
     * provider card flips to connected — the same signal the OAuth flow emits. A
     * failure rejects so the caller surfaces the real reason (never swallowed).
     */
    async setProviderApiKey(name: string, apiKey: string): Promise<void> {
      const pid = toNewProvider(name);
      if (!pid) throw new Error(`provider ${name} not supported`);
      // OpenCode's Zen + Go gateways share one opencode.ai key (pi reads
      // OPENCODE_API_KEY for both), so store the pasted key under every sibling
      // gateway — one connect lights up both. `pid` (the connected id) is the one
      // that becomes active; the order of the writes doesn't affect that.
      const targets = credentialSiblings(pid);
      if (this.ctx.cp) {
        // First-run pre-agent: store through the setup runtime instead — the key
        // lands on the personal workspace and the agent created next reads it.
        // No per-agent settings exist yet to flip.
        const agentId = this.ctx.currentAgentId();
        if (!agentId) {
          for (const target of targets) {
            await controlPlane.setSetupApiKey(this.ctx.cp, target, apiKey);
          }
          emitEvent("ProviderLoginComplete", {
            provider: name,
            success: true,
            error: null,
          });
          return;
        }
        for (const target of targets) {
          await controlPlane.setApiKey(this.ctx.cp, agentId, target, apiKey);
        }
        // CLAIM (don't set) the active provider: it becomes active only when the
        // agent doesn't already resolve to one — a first connect on a fresh
        // agent. Connecting a credential is not a model pick (HOU-695):
        // unconditionally activating it here used to flip every open chat onto
        // the new provider (paste an OpenCode key mid-Codex-chat → the next turn
        // answers, bills, and quota-errors on OpenCode). Switching stays the
        // model picker's job. Settings are PER-AGENT on the host, so this MUST
        // go through the agent's runtime client.
        await controlPlane
          .runtimeClientFor(this.ctx.cp, agentId)
          .claimActiveProvider(pid);
      } else {
        for (const target of targets) {
          await this.ctx.engine.setApiKey(target, apiKey);
        }
        await this.ctx.engine.claimActiveProvider(pid);
      }
      // One completion event for the single account the user connected (never one
      // per gateway), so the connect dialog closes and exactly one card flips.
      emitEvent("ProviderLoginComplete", {
        provider: name,
        success: true,
        error: null,
      });
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
        const agentId = this.ctx.requireAgentId();
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
     * control-plane.getTunnelCredentials). Cloud/hosted only — locally there is no
     * gateway to issue one (and no tunnel is needed, the runtime is co-located),
     * so reject loudly rather than pretend.
     */
    async getTunnelCredentials(): Promise<TunnelCredentials> {
      if (!this.ctx.cp)
        throw new Error(
          "Connecting a local model to a cloud agent needs a cloud workspace.",
        );
      return controlPlane.getTunnelCredentials(this.ctx.cp);
    }
  }
  return ProviderCredentials;
}
