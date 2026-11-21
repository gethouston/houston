import type { ServerResponse } from "node:http";
import type { AgentDelegationRefusalCode } from "@houston/protocol";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import { resolveMissionGateway } from "./agent-caller-wiring";
import {
  agentRefDirectory,
  describeAgentRef,
  matchAgentRefs,
} from "./agent-refs";
import { json } from "./http";
import {
  localDelegationRefusal,
  type MissionRouteOp,
} from "./mission-delegation";
import { delegationRefusal } from "./mission-delegation-refusals";
import {
  type MissionDirectoryOptions,
  missionTargetDirectory,
} from "./missions-directory";
import type { RemoteMissionRoute } from "./missions-remote";
import type { MissionsCtx } from "./missions-sandbox";

export type MissionRouteError =
  | "invalid_agent"
  | "agent_not_found"
  | "agent_ambiguous"
  | "agents_unreadable"
  | AgentDelegationRefusalCode;

export type MissionRoute =
  | { ok: true; remote: false; ctx: MissionsCtx }
  | { ok: true; remote: true; route: RemoteMissionRoute }
  | { ok: false; status: number; code: MissionRouteError; error: string };

export async function resolveMissionRoute(
  ctx: MissionsCtx,
  ref: unknown,
  opts: MissionDirectoryOptions = {},
  op: MissionRouteOp = "read",
): Promise<MissionRoute> {
  if (ref === undefined || ref === null) {
    if (assistantRuntimeRole({ agentId: ctx.agent.id })) {
      return {
        ok: false,
        status: 400,
        code: "invalid_agent",
        error: "name the agent whose board this mission belongs on",
      };
    }
    return { ok: true, remote: false, ctx };
  }
  if (typeof ref !== "string" || !ref.trim()) {
    return {
      ok: false,
      status: 400,
      code: "invalid_agent",
      error: "'agent' must name the agent whose board this mission belongs on",
    };
  }
  const wanted = ref.trim();
  const directory = await missionTargetDirectory(ctx, {
    actingAs: ctx.actingAs,
    ...opts,
  }).list();
  if (!directory.ok) {
    return {
      ok: false,
      status: directory.status,
      code: directory.code,
      error: directory.error,
    };
  }
  const found = matchAgentRefs(directory.candidates, wanted);
  const target = found[0];
  if (!target) {
    const names = agentRefDirectory(directory.candidates);
    return {
      ok: false,
      status: 404,
      code: "agent_not_found",
      error: names
        ? `there is no agent called "${wanted}" - the agents here are: ${names}`
        : `there is no agent called "${wanted}"`,
    };
  }
  if (found.length > 1) {
    return {
      ok: false,
      status: 409,
      code: "agent_ambiguous",
      error: `"${wanted}" names more than one agent - say which one: ${found
        .map(describeAgentRef)
        .join(", ")}`,
    };
  }
  if (!target.remote) {
    const refused = await localDelegationRefusal(ctx, target, op);
    if (refused) return refused;
    return {
      ok: true,
      remote: false,
      ctx: {
        ...ctx,
        ws: target.ws,
        agent: target.agent,
        root: ctx.paths.agentRoot(target.ws, target.agent),
      },
    };
  }
  const wiring = resolveMissionGateway(ctx);
  if (!wiring.ok) return { ok: false, ...delegationRefusal(wiring.code) };
  const gateway = opts.gateway ?? wiring.value?.gateway;
  if (!gateway) {
    return {
      ok: false,
      status: 502,
      code: "agents_unreadable",
      error: `could not reach ${target.name} right now - try again`,
    };
  }
  return {
    ok: true,
    remote: true,
    route: {
      target,
      gateway,
      ...(wiring.value?.actingAs ? { actingAs: wiring.value.actingAs } : {}),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    },
  };
}

export function refuseMissionRoute(
  refusal: Extract<MissionRoute, { ok: false }>,
  res: ServerResponse,
): void {
  json(res, refusal.status, { error: refusal.error, code: refusal.code });
}
