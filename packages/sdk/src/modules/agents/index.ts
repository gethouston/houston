/**
 * The agents module — the SDK-canonical agent-list read/write surface.
 *
 * Reads: publishes the `agents` scope view-model ({@link AgentsViewModel}),
 * republished whole on every change. Writes: `create` / `rename` / `delete` are
 * optimistic-free — mutate, then refetch so the snapshot always reflects the
 * server. The same handlers back both the typed facade and the bridge
 * `dispatch` path (kernel `commands.ts`), so there is one implementation each.
 *
 * Reactivity: a global `/v1/events` subscription started here refetches on every
 * (re)connect and on every `AgentsChanged` frame. It is torn down through the
 * facade's {@link AgentsModule.dispose}, which `HoustonSdk.dispose` calls.
 *
 * 401s route through the shared {@link ModuleContext.authExpiry} notifier, so a
 * lapsed session token emits ONE `session/tokenExpired` (deduped per token value
 * across every module) instead of a per-reconnect storm.
 */

import type { ModuleContext } from "../../module-context";
import { startAgentsEventStream } from "./events-stream";
import { createAgentsHttp } from "./http";
import {
  AGENTS_SCOPE,
  AgentsCommand,
  type AgentsViewModel,
  type WireAgent,
} from "./types";

export { AgentsHttpError } from "./http";
export type { AgentListItem, AgentsViewModel, WireAgent } from "./types";
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
  /** Create an agent named `name`, then refetch. */
  create(name: string): Promise<void>;
  /** Rename agent `id` to `name`, then refetch. */
  rename(id: string, name: string): Promise<void>;
  /** Delete agent `id`, then refetch. */
  delete(id: string): Promise<void>;
  /** Stop the reactivity stream. Module-local; the kernel has no dispose seam. */
  dispose(): void;
}

function toItem(a: WireAgent): AgentsViewModel["items"][number] {
  return {
    id: a.id,
    name: a.name,
    workspaceId: a.workspaceId,
    createdAt: a.createdAt,
  };
}

/** Pull a required non-empty string off an untrusted command payload. */
function requireString(payload: unknown, key: string): string {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

export function createAgentsModule(ctx: ModuleContext): AgentsModule {
  const { store, authExpiry } = ctx;
  const { baseUrl, ports } = ctx.config;

  const emitTokenExpired = () => authExpiry.notifyExpired();

  const http = createAgentsHttp(baseUrl, ports, emitTokenExpired);

  async function refresh(): Promise<void> {
    const agents = await http.list();
    store.publish(AGENTS_SCOPE, {
      loaded: true,
      items: agents.map(toItem),
    } satisfies AgentsViewModel);
  }

  async function create(name: string): Promise<void> {
    await http.create(name);
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

  ctx.registerCommand(AgentsCommand.Refresh, () => refresh());
  ctx.registerCommand(AgentsCommand.Create, (p) =>
    create(requireString(p, "name")),
  );
  ctx.registerCommand(AgentsCommand.Rename, (p) =>
    rename(requireString(p, "id"), requireString(p, "name")),
  );
  ctx.registerCommand(AgentsCommand.Delete, (p) => del(requireString(p, "id")));

  // Publish a defined "loading" snapshot, but asynchronously: the store stays
  // untouched at construction, so a subscriber reads `undefined` until the first
  // real load lands. Skipped if the stream's onConnect refetch already won.
  void Promise.resolve().then(() => {
    if (store.getSnapshot(AGENTS_SCOPE) === undefined) {
      store.publish(AGENTS_SCOPE, {
        loaded: false,
        items: [],
      } satisfies AgentsViewModel);
    }
  });

  // A stream-driven background refetch is not a user action: a transient failure
  // just leaves the snapshot stale until the next event. A 401 still surfaces
  // (http fires emitTokenExpired), so only the noise is logged, never swallowed.
  const backgroundRefresh = (where: string) =>
    void refresh().catch((err) =>
      ports.logger.debug(`agents refresh (${where}) failed`, {
        error: String(err),
      }),
    );

  const dispose = startAgentsEventStream({
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

  return { refresh, create, rename, delete: del, dispose };
}
