import type { ServerResponse } from "node:http";
import type { Agent, Workspace } from "../domain/types";
import { json } from "./http";
import type { MissionsCtx } from "./missions-sandbox";

/**
 * WHICH agent's board a mission call acts on. Absent → the calling agent's own
 * board (every agent's own missions, unchanged). Present → the named agent's,
 * which is what the personal assistant needs: it keeps no board of its own, so
 * the work it starts must land where the user actually sees it.
 *
 * Resolution is fail-closed and scoped to what the CALLER can already reach —
 * the workspaces of the user who owns the calling agent. A name that resolves
 * to nothing answers with the names that WOULD resolve, so the model corrects
 * itself instead of guessing again (the same stance as the other agent-facing
 * error bodies). Hidden dot-agents (the personal assistant itself, the setup
 * runtime) are not listed and never match: they have no board by design.
 */

export type TargetResolution =
  | { ok: true; ctx: MissionsCtx }
  | { ok: false; status: number; error: string };

interface Reachable {
  workspace: Workspace;
  agent: Agent;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Every agent the calling agent's owner can reach, its own workspace first. */
async function reachableAgents(ctx: MissionsCtx): Promise<Reachable[]> {
  const workspaces = await ctx.deps.store.listWorkspacesForUser(
    ctx.ws.ownerUserId,
  );
  const ordered = [
    ctx.ws,
    ...workspaces.filter(
      (w) => w.id !== ctx.ws.id && w.ownerUserId === ctx.ws.ownerUserId,
    ),
  ];
  const out: Reachable[] = [];
  for (const workspace of ordered) {
    for (const agent of await ctx.deps.store.listAgents(workspace.id)) {
      // Dot-named agents are synthetic and list-hidden by construction; they
      // hold no board, so they are not a place work can go.
      if (!agent.name.startsWith(".")) out.push({ workspace, agent });
    }
  }
  return out;
}

/**
 * Retarget `ctx` at the agent named by `ref` (its id, its name, or
 * `<Workspace>/<Agent>`). The returned ctx carries the target's workspace,
 * agent and document root, so every handler downstream stays target-blind.
 */
export async function resolveMissionTarget(
  ctx: MissionsCtx,
  ref: unknown,
): Promise<TargetResolution> {
  if (ref === undefined || ref === null) return { ok: true, ctx };
  if (typeof ref !== "string" || !ref.trim()) {
    return {
      ok: false,
      status: 400,
      error: "'agent' must name the agent whose board this mission belongs on",
    };
  }
  const wanted = ref.trim();
  const reachable = await reachableAgents(ctx);
  const match = reachable.find(
    ({ workspace, agent }) =>
      agent.id === wanted ||
      eq(agent.name, wanted) ||
      eq(`${workspace.name}/${agent.name}`, wanted) ||
      eq(`${workspace.id}/${agent.name}`, wanted),
  );
  if (!match) {
    const names = reachable.map((r) => r.agent.name).join(", ");
    return {
      ok: false,
      status: 404,
      error: names
        ? `there is no agent called "${wanted}" — the agents here are: ${names}`
        : `there is no agent called "${wanted}"`,
    };
  }
  return {
    ok: true,
    ctx: {
      ...ctx,
      ws: match.workspace,
      agent: match.agent,
      root: ctx.paths.agentRoot(match.workspace, match.agent),
    },
  };
}

/** Resolve, or write the refusal and answer null. */
export async function targetOrRefuse(
  ctx: MissionsCtx,
  ref: unknown,
  res: ServerResponse,
): Promise<MissionsCtx | null> {
  const resolved = await resolveMissionTarget(ctx, ref);
  if (resolved.ok) return resolved.ctx;
  json(res, resolved.status, { error: resolved.error });
  return null;
}
