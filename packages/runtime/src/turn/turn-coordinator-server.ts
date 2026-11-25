import {
  type CoordinatorScope,
  runAsCoordinator,
} from "@houston/host/src/assistant/coordinator-scope";
import { handleSandboxAssistant } from "@houston/host/src/routes/assistant-sandbox";
import type { AssistantSandboxDeps } from "@houston/host/src/routes/assistant-sandbox-deps";
import {
  handleSandboxMissions,
  type MissionsDeps,
} from "@houston/host/src/routes/missions-sandbox";
import { listenTurnHost, type TurnHostServer } from "./turn-host-server";

export interface CoordinatorRoutes {
  scope: CoordinatorScope;
  claim: { workspaceId: string; agentId: string };
  assistant: () => Promise<Omit<AssistantSandboxDeps, "vault">>;
  missions: Omit<MissionsDeps, "gatewayFronted">;
}

export type CoordinatorServer = TurnHostServer;

export function listenCoordinator(
  routes: CoordinatorRoutes,
): Promise<CoordinatorServer> {
  return listenTurnHost({
    claim: routes.claim,
    label: "turn-coordinator",
    unavailable: {
      error: "Houston could not do that right now",
      code: "coordinator_unavailable",
    },
    run: (serve) => runAsCoordinator(routes.scope, serve),
    handle: async (vault, method, url, req, res) =>
      url.pathname.startsWith("/sandbox/assistant/")
        ? handleSandboxAssistant(
            { ...(await routes.assistant()), vault, gatewayFronted: true },
            method,
            url.pathname,
            url,
            req,
            res,
          )
        : handleSandboxMissions(
            { ...routes.missions, vault, gatewayFronted: true },
            method,
            url.pathname,
            url,
            req,
            res,
          ),
  });
}
