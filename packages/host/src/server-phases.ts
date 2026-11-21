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

type Gate<Ctx> = (ctx: Ctx) => boolean | Promise<boolean>;

const PRE_AUTH_GATES: Partial<Record<GroupId, Gate<PublicEntry>>> = {
  "sandbox-credential": (ctx) =>
    refuseOutOfCoordinatorScope(ctx.deps, ctx.path, ctx.url, ctx.req, ctx.res),
};

export async function dispatchPreAuth(ctx: PublicEntry): Promise<boolean> {
  if (
    await handleStoreFenceGate(
      ctx.deps,
      ctx.method,
      ctx.path,
      ctx.res,
      "sandbox",
    )
  ) {
    return true;
  }
  for (const group of PRE_AUTH_GROUPS) {
    if (await PRE_AUTH_GATES[group]?.(ctx)) return true;
    if (await dispatchGroup(group, ctx)) return true;
  }
  return false;
}

const USER_GATES: Partial<
  Record<GroupId, (ctx: UserEntry) => Promise<boolean>>
> = {
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

export async function dispatchUser(ctx: UserEntry): Promise<boolean> {
  for (const group of USER_GROUPS) {
    if (await USER_GATES[group]?.(ctx)) return true;
    if (await dispatchGroup(group, ctx)) return true;
  }
  return false;
}

export async function dispatchAgent(ctx: AgentEntry): Promise<boolean> {
  for (const group of AGENT_GROUPS)
    if (await dispatchGroup(group, ctx)) return true;
  return false;
}

export function rememberAddressedAgent(
  deps: ControlPlaneDeps,
  path: string,
): void {
  if (!deps.addressedAgent) return;
  const addressed = /^\/agents\/([^/]+)(?:\/|$)/.exec(path);
  if (addressed?.[1]) deps.addressedAgent(decodeURIComponent(addressed[1]));
}
