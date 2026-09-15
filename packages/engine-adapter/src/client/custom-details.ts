import type { AdapterContext } from "./context";
import { viaSdk } from "./sdk-error";

/**
 * The detail card's cosmetic edit (name + website), in whichever route family
 * the deployment serves: the user-scoped one on a direct host, the per-agent
 * dispatch form when the caller names an agent (a hosted gateway proxies it to
 * that agent's pod). Both are `sdk.integrations.*` twins of the same PATCH.
 */
export function updateDetails(
  ctx: AdapterContext,
  slug: string,
  details: { name: string; website: string },
  agentId?: string,
): Promise<void> {
  const definition = `integrations/custom/definitions/${encodeURIComponent(slug)}`;
  if (!agentId) {
    if (!ctx.cp) throw new Error("Integrations require a connected host");
    return viaSdk(`/v1/${definition}`, () =>
      ctx.sdk.integrations.custom.updateDetails(slug, details),
    );
  }
  return viaSdk(`/agents/${encodeURIComponent(agentId)}/${definition}`, () =>
    ctx.sdk.integrations.agentCustom.updateDetails(agentId, slug, details),
  );
}
