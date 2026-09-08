import type { ServerResponse } from "node:http";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import {
  agentRefDirectory,
  describeAgentRef,
  matchAgentRefs,
} from "./agent-refs";
import { resolveAssistantGateway } from "./assistant-wiring";
import { json } from "./http";
import {
  type MissionDirectoryOptions,
  missionTargetDirectory,
} from "./missions-directory";
import type { RemoteMissionRoute } from "./missions-remote";
import type { MissionsCtx } from "./missions-sandbox";

/**
 * WHICH agent's board a mission call acts on. Absent → the calling agent's own
 * board (every agent's own missions, unchanged). Present → the named agent's,
 * which is what the personal assistant needs: it keeps no board of its own, so
 * the work it starts must land where the user actually sees it.
 *
 * Resolution is fail-closed and scoped to what the CALLER can already reach:
 * the agents in this host, plus — in managed cloud, where every agent is its
 * own pod — the agents the gateway lists for the user (missions-directory.ts).
 * A name that resolves to nothing answers with the names that WOULD resolve,
 * and a name that resolves to SEVERAL is refused with the qualified names that
 * separate them, so the model corrects itself instead of guessing again.
 *
 * A resolved target is either local (the handler retargets its ctx and stays
 * target-blind) or remote (the call travels to that agent's pod,
 * missions-remote.ts). Refusals are values carrying a code.
 */

export type MissionRouteError =
  | "invalid_agent"
  | "agent_not_found"
  | "agent_ambiguous"
  | "agents_unreadable";

export type MissionRoute =
  | { ok: true; remote: false; ctx: MissionsCtx }
  | { ok: true; remote: true; route: RemoteMissionRoute }
  | { ok: false; status: number; code: MissionRouteError; error: string };

/**
 * Retarget a mission call at the agent named by `ref`. Answers the local ctx
 * for an agent this host holds, or the route to the pod that holds it.
 */
export async function resolveMissionRoute(
  ctx: MissionsCtx,
  ref: unknown,
  opts: MissionDirectoryOptions = {},
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
  // The directory only produced a remote candidate because a gateway answered
  // for it, so the credential that listed it is the one that drives it.
  const gateway = opts.gateway ?? resolveAssistantGateway();
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
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    },
  };
}

/** Write a refusal as the agent-facing body every mission route answers with. */
export function refuseMissionRoute(
  refusal: Extract<MissionRoute, { ok: false }>,
  res: ServerResponse,
): void {
  json(res, refusal.status, { error: refusal.error, code: refusal.code });
}
