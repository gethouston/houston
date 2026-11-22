import { join } from "node:path";
import { loadActivities, missionConversationKey } from "@houston/domain";
import { actingDelegatorFromHeader } from "@houston/host/src/auth/acting";
import type { MissionGuidance } from "@houston/host/src/houston-prompt-missions";
import { LocalPaths } from "@houston/host/src/paths";
import type { AssistantGateway } from "@houston/host/src/routes/assistant-forward";
import { liveTurns } from "@houston/host/src/routes/live-turn";
import { handleSandboxMissions } from "@houston/host/src/routes/missions-sandbox";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { PrefixedVfs } from "@houston/host/src/vfs";
import { engineAgentId } from "./op-scope";
import type { TurnFilesystem } from "./turn-filesystem";
import {
  callTurnHost,
  listenTurnHost,
  type TurnHostServer,
} from "./turn-host-server";
import type { TurnRequest } from "./types";

const ROUTES = new Set([
  "GET /sandbox/missions",
  "GET /sandbox/missions/read",
  "GET /sandbox/missions/agents",
  "GET /sandbox/missions/agents/read",
  "POST /sandbox/missions/start",
  "POST /sandbox/missions/status",
]);

export interface TurnMissionsInput {
  turn: TurnRequest;
  actingToken: string;
  gateway: AssistantGateway;
  agentSlug: string;
  filesystem: TurnFilesystem;
}

export interface TurnMissionsSession {
  route(path: string, init?: RequestInit): Promise<Response> | null;
  guidance: Promise<MissionGuidance>;
  dispose(): Promise<void>;
}

export function startTurnMissions(
  input: TurnMissionsInput,
): TurnMissionsSession {
  const { turn, filesystem } = input;
  const agentId = engineAgentId(filesystem);
  const workspaceId = agentId.split("/")[0] ?? agentId;
  const conversationId = turn.conversationId;
  const mode = () => turn.liveMode?.current ?? turn.mode ?? "execute";
  liveTurns.start(agentId, conversationId, mode(), {
    actingAs: input.actingToken,
    actingUser: turn.actingAs?.userId,
    limits: turn.limits,
  });
  const deps = {
    store: new LocalWorkspaceStore(join(filesystem.storeRoot, "workspaces")),
    vfs: new PrefixedVfs(filesystem.vfs, "workspaces"),
    paths: new LocalPaths(),
    channels: {},
    gatewayFronted: true,
    pooledTurn: { gateway: input.gateway, agentSlug: input.agentSlug },
  };
  const guidance = missionGuidance(input).catch((error: unknown) => {
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}` : "error";
    console.error(
      `[turn-missions] board unreadable for the prompt (${detail})`,
    );
    return "full" as const;
  });
  let server: Promise<TurnHostServer> | undefined;
  const listen = () => {
    server ??= listenTurnHost({
      claim: { workspaceId, agentId },
      label: "turn-missions",
      unavailable: {
        error: "the mission board could not be reached right now",
        code: "missions_unavailable",
      },
      handle: (vault, method, url, req, res) =>
        handleSandboxMissions(
          { ...deps, vault },
          method,
          url.pathname,
          url,
          req,
          res,
        ),
    });
    return server;
  };
  return {
    route(path, init) {
      const pathname = path.split("?")[0] ?? path;
      const method = (init?.method ?? "GET").toUpperCase();
      if (!ROUTES.has(`${method} ${pathname}`)) return null;
      liveTurns.setMode(agentId, conversationId, mode());
      return listen().then((host) => callTurnHost(host, path, init));
    },
    guidance,
    async dispose() {
      liveTurns.end(agentId, conversationId);
      if (server) await (await server).close();
    },
  };
}

async function missionGuidance(
  input: TurnMissionsInput,
): Promise<MissionGuidance> {
  if (actingDelegatorFromHeader(input.actingToken)) return "nested";
  const { items } = await loadActivities(
    input.filesystem.vfs,
    input.filesystem.workspaceRel,
  );
  const own = items.find(
    (item) => missionConversationKey(item) === input.turn.conversationId,
  );
  return own?.origin_session_key ? "nested" : "full";
}
