import type { ControlPlaneDeps } from "./control-plane-deps";
import { dispatchGroup } from "./routes/registry/all";
import type {
  AgentEntry,
  PublicEntry,
  UserEntry,
} from "./routes/registry/context";
import {
  AGENT_GROUPS,
  type GroupId,
  PRE_AUTH_GROUPS,
  USER_GROUPS,
} from "./routes/registry/groups";
import { refuseOutOfCoordinatorScope } from "./routes/sandbox-scope";
import { handleStoreFenceGate } from "./routes/store-fence-gate";

/**
 * The chain, walked segment by segment over registry/groups.ts's table. One
 * loop per segment rather than one call per group: the table is the order, so
 * a group cannot be reached out of turn and none can be forgotten.
 *
 * The gates below are the chain's non-route steps, each keyed by the group
 * whose slot it runs in FRONT of — the exact position the request pipeline has
 * always run them from.
 */

/** Gate answered before its group; true when it wrote the response. */
type Gate<Ctx> = (ctx: Ctx) => boolean;

const PRE_AUTH_GATES: Partial<Record<GroupId, Gate<PublicEntry>>> = {
  // THE COORDINATOR'S REACH (routes/sandbox-scope.ts). Every /sandbox/* family
  // authenticates a sandbox token, which is the right gate for an ordinary
  // agent and too wide a one for the personal assistant: this refuses the
  // families the coordinator has no tool for before any of them is asked.
  "sandbox-credential": (ctx) =>
    refuseOutOfCoordinatorScope(ctx.deps, ctx.path, ctx.url, ctx.req, ctx.res),
  // A pod that lost its object-store write fence must not accept writes it can
  // no longer persist (PRODUCT-1706): the runtime's own saves refused here,
  // the user-facing /agents/ writes after the 401 wall.
  "sandbox-routines": (ctx) =>
    handleStoreFenceGate(ctx.deps, ctx.method, ctx.path, ctx.res, "sandbox"),
};

/** Public + sandbox: everything served before a bearer token is required. */
export async function dispatchPreAuth(ctx: PublicEntry): Promise<boolean> {
  for (const group of PRE_AUTH_GROUPS) {
    if (PRE_AUTH_GATES[group]?.(ctx)) return true;
    if (await dispatchGroup(group, ctx)) return true;
  }
  return false;
}

const USER_GATES: Partial<
  Record<GroupId, (ctx: UserEntry) => Promise<boolean>>
> = {
  // The operator-admin seam (admin-seam.ts), in the slot the closed control
  // plane mounted it at: after the events stream, before the user resources.
  feedback: async (ctx) =>
    (await ctx.deps.mountAdmin?.(
      ctx.userId,
      ctx.method,
      ctx.path,
      ctx.url,
      ctx.req,
      ctx.res,
    )) ?? false,
};

/** User-level resources — authenticated, with no agent in the path. */
export async function dispatchUser(ctx: UserEntry): Promise<boolean> {
  for (const group of USER_GROUPS) {
    if (await USER_GATES[group]?.(ctx)) return true;
    if (await dispatchGroup(group, ctx)) return true;
  }
  return false;
}

/**
 * Everything scoped to ONE agent. The dispatcher runs the ownership check for
 * the agent the matched pattern names, and the segment's LAST group claims the
 * rest of the subtree for the agent's own engine — so a route the host serves
 * itself exists only by sitting above it in the table.
 */
export async function dispatchAgent(ctx: AgentEntry): Promise<boolean> {
  for (const group of AGENT_GROUPS)
    if (await dispatchGroup(group, ctx)) return true;
  return false;
}

/**
 * An AUTHENTICATED /agents/<id>/ request names the agent this host is
 * addressed as — the doc shadow's binding signal on hosts whose workspace
 * holds more than one agent directory (rename leftovers). After auth only: an
 * anonymous caller must never pick the binding.
 */
export function rememberAddressedAgent(
  deps: ControlPlaneDeps,
  path: string,
): void {
  if (!deps.addressedAgent) return;
  const addressed = /^\/agents\/([^/]+)(?:\/|$)/.exec(path);
  if (addressed?.[1]) deps.addressedAgent(decodeURIComponent(addressed[1]));
}
