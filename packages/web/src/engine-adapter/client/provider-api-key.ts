import { emitEvent } from "../bus";
import * as controlPlane from "../control-plane";
import { credentialSiblings, toNewProvider } from "../synthetic";
import type { AdapterContext } from "./context";
import { requireProviderRouting } from "./provider-routing";

/**
 * Connect an API-key provider (OpenCode Zen / Go, OpenRouter, Gemini, Bedrock):
 * the user pastes a key, no OAuth dance. Cloud stores it centrally (and pushes
 * it into the agent runtime) via the control plane; local writes it straight to
 * the single runtime. On success it fires `ProviderLoginComplete` so the connect
 * dialog closes and the provider card flips to connected — the same signal the
 * OAuth flow emits. A failure rejects so the caller surfaces the real reason
 * (never swallowed).
 */
export async function connectApiKey(
  ctx: AdapterContext,
  name: string,
  apiKey: string,
  endpoint?: string,
): Promise<void> {
  const pid = toNewProvider(name);
  if (!pid) throw new Error(`provider ${name} not supported`);
  // OpenCode's Zen + Go gateways share one opencode.ai key (pi reads
  // OPENCODE_API_KEY for both), so store the pasted key under every sibling
  // gateway — one connect lights up both. `pid` (the connected id) is the one
  // that becomes active; the order of the writes doesn't affect that.
  const targets = credentialSiblings(pid);
  if (ctx.cp) {
    // Refuse rather than guess: an unsettled list leaves only the raw pref,
    // which after a switch names the PREVIOUS space's agent (HOU-979).
    requireProviderRouting(ctx);
    // First-run pre-agent: store through the setup runtime instead — the key
    // lands on this space's central store and the agent created next reads it.
    // No per-agent settings exist yet to flip.
    const agentId = ctx.providerAgentId();
    if (!agentId) {
      for (const target of targets) {
        await controlPlane.setSetupApiKey(ctx.cp, target, apiKey, endpoint);
      }
      emitEvent("ProviderLoginComplete", {
        provider: name,
        success: true,
        error: null,
      });
      return;
    }
    for (const target of targets) {
      await controlPlane.setApiKey(ctx.cp, agentId, target, apiKey, endpoint);
    }
    // CLAIM (don't set) the active provider: it becomes active only when the
    // agent doesn't already resolve to one — a first connect on a fresh agent.
    // Connecting a credential is not a model pick (HOU-695): unconditionally
    // activating it here used to flip every open chat onto the new provider
    // (paste an OpenCode key mid-Codex-chat → the next turn answers, bills, and
    // quota-errors on OpenCode). Switching stays the model picker's job.
    // Settings are PER-AGENT on the host, so this MUST go through the agent's
    // runtime client.
    await controlPlane
      .runtimeClientFor(ctx.cp, agentId)
      .claimActiveProvider(pid);
  } else {
    for (const target of targets) {
      await ctx.engine.setApiKey(target, apiKey, endpoint);
    }
    await ctx.engine.claimActiveProvider(pid);
  }
  // One completion event for the single account the user connected (never one
  // per gateway), so the connect dialog closes and exactly one card flips.
  emitEvent("ProviderLoginComplete", {
    provider: name,
    success: true,
    error: null,
  });
}
