import type { Agent, Workspace } from "../domain/types";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import type { AgentRef } from "./agent-refs";
import type { AssistantGateway } from "./assistant-forward";
import { resolveAssistantGateway } from "./assistant-wiring";
import { gatewayMissionDirectory } from "./missions-directory-gateway";
import type { MissionsCtx } from "./missions-sandbox";
import { reachableAgents } from "./reachable-agents";

/**
 * WHICH agents a mission call may be addressed to — the one place that answers
 * it, because the answer differs by deployment:
 *
 *  - DESKTOP / SELF-HOST: every agent lives in this host, so its own store is
 *    the whole directory.
 *  - MANAGED CLOUD: each agent is its own pod, and the assistant's pod holds
 *    only the assistant. Its agents are the ones the GATEWAY lists for the
 *    user (`GET /agents`), reachable through the pod's gateway credential.
 *
 * Both shapes answer the same candidate list, so target resolution
 * (missions-target.ts) never branches on the deployment.
 */

/**
 * One agent a mission may be put on. It is an {@link AgentRef} — the shape the
 * shared ladder matches a written reference against (agent-refs.ts) — plus
 * where the board actually lives: on this disk, or in that agent's own pod.
 */
export interface LocalMissionTarget extends AgentRef {
  remote: false;
  ws: Workspace;
  agent: Agent;
}

export interface RemoteMissionTarget extends AgentRef {
  remote: true;
}

export type MissionTargetCandidate = LocalMissionTarget | RemoteMissionTarget;

export type MissionDirectoryResult =
  | { ok: true; candidates: MissionTargetCandidate[] }
  | { ok: false; status: number; code: "agents_unreadable"; error: string };

export interface MissionTargetDirectory {
  /** Every agent the caller can reach, its own space first. */
  list(): Promise<MissionDirectoryResult>;
}

/** Test seam / explicit wiring for the gateway half of the directory. */
export interface MissionDirectoryOptions {
  /** Where the user's other agents live. Default: the pod's gateway wiring. */
  gateway?: AssistantGateway | null;
  fetchImpl?: typeof fetch;
  /** The caller's verified acting identity, relayed to the gateway. */
  actingAs?: string;
}

/**
 * Every agent in the calling host's own store — the shared reachability rule
 * (reachable-agents.ts), which is also what the assistant dispatcher resolves
 * its agent parameters against, so the two surfaces can never disagree about
 * who is addressable.
 */
export function localMissionDirectory(
  ctx: MissionsCtx,
): MissionTargetDirectory {
  return {
    async list() {
      const reachable = await reachableAgents(ctx.deps.store, ctx.ws);
      return {
        ok: true,
        candidates: reachable
          .filter(
            ({ agent }) =>
              !(
                assistantRuntimeRole({ agentId: ctx.agent.id }) &&
                agent.id === ctx.agent.id
              ),
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

/**
 * The directory this deployment answers with: the local store, plus the
 * gateway's agents when a gateway both fronts this host and hands it a
 * credential (the managed assistant pod). Local candidates come first, so a
 * host that also holds the agent locally keeps serving it locally.
 */
export function missionTargetDirectory(
  ctx: MissionsCtx,
  opts: MissionDirectoryOptions = {},
): MissionTargetDirectory {
  const local = localMissionDirectory(ctx);
  const gateway =
    opts.gateway !== undefined
      ? opts.gateway
      : // Off the gateway this host serves every agent it knows about, and its
        // own self-wiring names ITSELF — a directory read there would be this
        // same store over a loopback hop.
        ctx.deps.gatewayFronted
        ? resolveAssistantGateway()
        : null;
  if (!gateway) return local;
  const remote = gatewayMissionDirectory(gateway, {
    ...opts,
    excludeIds: assistantRuntimeRole({ agentId: ctx.agent.id })
      ? [ctx.agent.id, process.env.HOUSTON_AGENT_SLUG ?? ctx.agent.id]
      : [],
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
