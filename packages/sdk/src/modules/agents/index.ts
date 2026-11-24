import type { ModuleContext } from "../../module-context";
import { requireString } from "../payload";
import { startAgentsEventStream } from "./events-stream";
import { type AgentsFirstDay, createAgentsFirstDay } from "./first-day";
import { agentsScope, createAgentsHttp } from "./http";
import { type AgentsAccount, createAgentsAccount } from "./library";
import {
  AGENTS_SCOPE,
  type AgentCreateInput,
  AgentsCommand,
  type AgentsViewModel,
  type AgentsWrites,
  type WireAgent,
} from "./types";

export type { FirstDayStartInput, FirstDayStartResult } from "./first-day";
export * from "./first-day-refusal";
export { AgentsHttpError } from "./http";
export type { AgentsAccount, AgentsLibrary } from "./library";
export { isAgentNameReserved, isAgentNameTaken } from "./refusals";
export type {
  AgentAccess,
  AgentAssignment,
  AgentCreateInput,
  AgentListItem,
  AgentsViewModel,
  AgentsWrites,
  InstalledConfig,
  WireAgent,
} from "./types";
export {
  AGENTS_CHANGED_EVENT,
  AGENTS_SCOPE,
  AgentsCommand,
  type AgentsCommandType,
} from "./types";

/** The typed facade for agent-list reads + writes. */
export interface AgentsModule {
  /** Refetch the list and republish the `agents` scope snapshot. */
  refresh(): Promise<void>;
  /**
   * The agent list as the host serves it, published nowhere. For a host that
   * owns its own read model (web under `reactivity:false`), where publishing
   * into a scope nobody subscribes to would be a second, unasked-for read.
   */
  list(): Promise<WireAgent[]>;
  /** Create an agent named `name`, then refetch. */
  create(name: string): Promise<void>;
  /** Rename agent `id` to `name`, then refetch. */
  rename(id: string, name: string): Promise<void>;
  /** Delete agent `id`, then refetch. */
  delete(id: string): Promise<void>;
  /**
   * No-refetch write variants for a host that owns its own reads (web under
   * `reactivity:false`): same wire writes, no post-write `refresh()`, and they
   * return the wire entity. A host without one uses the refetching methods
   * above.
   */
  writes: AgentsWrites;
  /** The account's library of installed agent templates. */
  library: AgentsAccount["library"];
  /** Set one agent's palette colour, in a single request. */
  setColor: AgentsAccount["setColor"];
  /** Start a new hire's first day, or hand back the setup task it has. */
  startFirstDay: AgentsFirstDay["startFirstDay"];
  /** Stop the reactivity stream. Module-local; the kernel has no dispose seam. */
  dispose(): void;
}

function toItem(a: WireAgent): AgentsViewModel["items"][number] {
  return {
    id: a.id,
    name: a.name,
    workspaceId: a.workspaceId,
    createdAt: a.createdAt,
    ...(a.role ? { role: a.role } : {}),
    ...(a.timezone ? { timezone: a.timezone } : {}),
  };
}

export function createAgentsModule(ctx: ModuleContext): AgentsModule {
  const { store, authExpiry } = ctx;
  const { baseUrl, ports } = ctx.config;

  const emitTokenExpired = () => authExpiry.notifyExpired();

  const scope = agentsScope(ctx);
  const http = createAgentsHttp(scope);
  const account = createAgentsAccount(ctx, scope);
  const firstDay = createAgentsFirstDay(ctx, scope);

  async function refresh(): Promise<void> {
    const agents = await http.list();
    store.publish(AGENTS_SCOPE, {
      loaded: true,
      items: agents.map(toItem),
    } satisfies AgentsViewModel);
  }

  async function create(name: string): Promise<void> {
    await http.create({ name });
    await refresh();
  }
  async function rename(id: string, name: string): Promise<void> {
    await http.rename(id, name);
    await refresh();
  }
  async function del(id: string): Promise<void> {
    await http.remove(id);
    await refresh();
  }

  const writes: AgentsWrites = {
    create: (input: AgentCreateInput) => http.create(input),
    rename: (id, name) => http.rename(id, name),
    delete: (id) => http.remove(id),
  };

  ctx.registerCommand(AgentsCommand.Refresh, () => refresh());
  ctx.registerCommand(AgentsCommand.Create, (p) =>
    create(requireString(p, "name")),
  );
  ctx.registerCommand(AgentsCommand.Rename, (p) =>
    rename(requireString(p, "id"), requireString(p, "name")),
  );
  ctx.registerCommand(AgentsCommand.Delete, (p) => del(requireString(p, "id")));

  void Promise.resolve().then(() => {
    if (store.getSnapshot(AGENTS_SCOPE) === undefined) {
      store.publish(AGENTS_SCOPE, {
        loaded: false,
        items: [],
      } satisfies AgentsViewModel);
    }
  });

  const backgroundRefresh = (where: string) =>
    void refresh().catch((err) =>
      ports.logger.debug(`agents refresh (${where}) failed`, {
        error: String(err),
      }),
    );

  const dispose =
    ctx.config.reactivity === false
      ? () => {}
      : startAgentsEventStream({
          baseUrl,
          fetch: ports.fetch,
          clock: ports.clock,
          logger: ports.logger,
          handlers: {
            onConnect: () => backgroundRefresh("connect"),
            onAgentsChanged: () => backgroundRefresh("change"),
            onUnauthorized: emitTokenExpired,
          },
        });

  return {
    refresh,
    list: () => http.list(),
    create,
    rename,
    delete: del,
    writes,
    ...account,
    ...firstDay,
    dispose,
  };
}
