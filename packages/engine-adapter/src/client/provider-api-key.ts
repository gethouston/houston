import { emitEvent } from "../bus";
import * as controlPlane from "../control-plane";
import { credentialSiblings, toNewProvider } from "../synthetic";
import type { AdapterContext } from "./context";
import { requireProviderRouting } from "./provider-routing";
import { viaSdk } from "./sdk-error";

export async function connectApiKey(
  ctx: AdapterContext,
  name: string,
  apiKey: string,
  endpoint?: string,
): Promise<void> {
  const pid = toNewProvider(name);
  if (!pid) throw new Error(`provider ${name} not supported`);
  const targets = credentialSiblings(pid);
  if (ctx.cp) {
    requireProviderRouting(ctx);
    const agentId = ctx.providerAgentId();
    const credentials = ctx.sdk.providers.credentials;
    if (!agentId) {
      for (const target of targets) {
        await viaSdk("/setup-runtime/credential/api-key", () =>
          credentials.setSetupApiKey(target, apiKey, endpoint),
        );
      }
      emitEvent("ProviderLoginComplete", {
        provider: name,
        success: true,
        error: null,
      });
      return;
    }
    for (const target of targets) {
      await viaSdk(
        `${controlPlane.agentPath(agentId)}/credential/api-key`,
        () => credentials.setApiKey(agentId, target, apiKey, endpoint),
      );
    }
    await controlPlane
      .runtimeClientFor(ctx.cp, agentId)
      .claimActiveProvider(pid);
  } else {
    for (const target of targets) {
      await ctx.engine.setApiKey(target, apiKey, endpoint);
    }
    await ctx.engine.claimActiveProvider(pid);
  }
  emitEvent("ProviderLoginComplete", {
    provider: name,
    success: true,
    error: null,
  });
}
