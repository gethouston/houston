import { cpFetch } from "../cp/fetch";
import type { AdapterContext } from "./context";
import { HoustonEngineError } from "./errors";

export async function updateDetails(
  ctx: AdapterContext,
  slug: string,
  details: { name: string; website: string },
  agentId?: string,
): Promise<void> {
  const init = {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  };
  const path = `/integrations/custom/definitions/${encodeURIComponent(slug)}`;
  if (!agentId) {
    if (!ctx.cp) throw new Error("Integrations require a connected host");
    await cpFetch(ctx.cp, `/v1${path}`, init);
    return;
  }
  const res = await ctx.authFetch(
    `${ctx.baseUrl}/agents/${encodeURIComponent(agentId)}${path}`,
    init,
  );
  if (!res.ok) throw new HoustonEngineError(res.status, await res.json());
}
