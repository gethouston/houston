import type { AdapterContext } from "./context";

/**
 * The agent id an SDK conversation call is scoped to.
 *
 * Cloud nests every conversation route under the agent's own sandbox
 * (`/agents/<id>/…`, which the gateway proxies to that agent's pod); the local
 * single runtime serves the same routes flat and names itself with the empty
 * id, which is what `sdk.clientFor("")` roots at.
 */
export const runtimeScope = (ctx: AdapterContext, agentPath: string): string =>
  ctx.cp ? agentPath : "";
