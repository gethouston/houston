import type { AgentDelegationRefusalCode } from "@houston/protocol";
import { gatewayAgentSlug } from "../assistant/coordinator-scope";
import type { Agent, Workspace } from "../domain/types";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import { resolveMissionGateway } from "./agent-caller-wiring";
import type { AgentRef } from "./agent-refs";
import type { AssistantGateway } from "./assistant-forward";
import { delegationRefusal } from "./mission-delegation-refusals";
import { gatewayMissionDirectory } from "./missions-directory-gateway";
import type { MissionsCtx } from "./missions-sandbox";
import { reachableAgents } from "./reachable-agents";

export interface LocalMissionTarget extends AgentRef {
  remote: false;
  ws: Workspace;
  agent: Agent;
}

export interface RemoteMissionTarget extends AgentRef {
  remote: true;
  role?: string;
}

export type MissionTargetCandidate = LocalMissionTarget | RemoteMissionTarget;

export type MissionDirectoryResult =
  | { ok: true; candidates: MissionTargetCandidate[] }
  | {
      ok: false;
      status: number;
      code: "agents_unreadable" | AgentDelegationRefusalCode;
      error: string;
    };

export interface MissionTargetDirectory {
  list(): Promise<MissionDirectoryResult>;
}

export interface MissionDirectoryOptions {
  gateway?: AssistantGateway | null;
  fetchImpl?: typeof fetch;
  actingAs?: string;
}

export function localMissionDirectory(
  ctx: MissionsCtx,
): MissionTargetDirectory {
  return {
    async list() {
      const reachable = await reachableAgents(ctx.deps.store, ctx.ws);
      const manager = assistantRuntimeRole({ agentId: ctx.agent.id });
      return {
        ok: true,
        candidates: reachable
          .filter(
            ({ workspace, agent }) =>
              (manager || workspace.id === ctx.ws.id) &&
              (!manager || agent.id !== ctx.agent.id),
          )
          .map(({ workspace, agent }) => ({
            remote: false as const,
            id: agent.id,
            name: agent.name,
            workspace: workspace.name,
            workspaceId: workspace.id,
            ws: workspace,
            agent,
          })),
      };
    },
  };
}

export function missionTargetDirectory(
  ctx: MissionsCtx,
  opts: MissionDirectoryOptions = {},
): MissionTargetDirectory {
  const local = localMissionDirectory(ctx);
  const wiring = resolveMissionGateway(ctx);
  if (!wiring.ok)
    return {
      list: async () => ({ ok: false, ...delegationRefusal(wiring.code) }),
    };
  const gateway =
    opts.gateway !== undefined ? opts.gateway : (wiring.value?.gateway ?? null);
  if (!gateway) return local;
  const remote = gatewayMissionDirectory(gateway, {
    ...opts,
    actingAs: opts.actingAs ?? wiring.value?.actingAs,
    excludeIds: [ctx.agent.id, gatewayAgentSlug() ?? ctx.agent.id],
  });
  return {
    async list() {
      const [here, there] = await Promise.all([local.list(), remote.list()]);
      if (!here.ok) return here;
      if (!there.ok) return there;
      return {
        ok: true,
        candidates: [...here.candidates, ...there.candidates],
      };
    },
  };
}
