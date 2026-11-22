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

/**
 * The host half of a standing assistant pod, for ONE pooled Houston turn.
 *
 * On a pod the runtime reaches Houston operations and the mission board
 * through its host over loopback, with a per-agent sandbox token. This is the
 * same arrangement inside the worker: the SAME host handlers
 * (`routes/assistant-sandbox.ts`, `routes/missions-sandbox.ts`) on a loopback
 * port that lives for the turn, accepting only a random token minted for it
 * and held in this process. Every request runs inside the turn's coordinator
 * scope, which is how those handlers learn the owner, the slug and the
 * turn's credential without a pod environment.
 */
export interface CoordinatorRoutes {
  scope: CoordinatorScope;
  claim: { workspaceId: string; agentId: string };
  /** Resolved per request: the approval records may still be loading. */
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
