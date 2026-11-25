import type { MissionsCtx } from "./missions-sandbox";
import type { MissionRoute } from "./missions-target";

export function ownBoardViaGateway(
  caller: MissionsCtx,
  route: MissionRoute,
): MissionRoute {
  const pooled = caller.deps.pooledTurn;
  if (!pooled || !route.ok || route.remote) return route;
  if (route.ctx.agent.id !== caller.agent.id) return route;
  return {
    ok: true,
    remote: true,
    route: {
      target: {
        remote: true,
        id: pooled.agentSlug,
        name: caller.agent.name,
        workspace: caller.ws.name,
        workspaceId: caller.ws.id,
      },
      gateway: pooled.gateway,
      ...(caller.actingAs ? { actingAs: caller.actingAs } : {}),
    },
  };
}
