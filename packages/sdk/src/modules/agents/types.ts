/**
 * Wire + view-model types and the typed string constants for the agents module.
 *
 * The `agents` scope snapshot is the SDK-canonical version of what the web
 * control-plane adapter builds today (`packages/web/src/engine-adapter/
 * control-plane.ts` `listAgents`): the host's `GET /agents` list, republished
 * whole on every change. Everything here is plain JSON — it crosses the
 * `getSnapshot`/`subscribe` boundary unchanged.
 */

/**
 * One agent exactly as the host's `GET /agents` returns it (protocol v3, the
 * `Agent` record in `packages/host/src/domain/types.ts`). Assignment fields
 * are hosted-gateway extras the base host route does not serve, so the SDK
 * does not invent them.
 */
export interface WireAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
  /**
   * Rust-era legacy color, read by the host from the agent's
   * `.houston/agent.json` (local/self-host profiles only; the hosted gateway
   * omits it). A client's own color overlay outranks it — this only fills the
   * gap for agents whose color was picked before the engine cutover.
   */
  color?: string;
}

/** A single agent inside the `agents` scope snapshot. */
export interface AgentListItem {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: number;
}

/**
 * The full create body the host's `POST /agents` accepts (protocol v3): a
 * required `name`, plus the optional seed payload a rich create carries —
 * `claudeMd` (the agent's CLAUDE.md) and `seeds` (a relative-path → contents
 * map the host writes into the new agent). `JSON.stringify` drops the undefined
 * optionals, so a `{ name }` create posts exactly `{ name }` on the wire (the
 * shape the existing {@link AgentsModule.create} facade and the bridge command
 * send — unchanged). Used by the no-refetch {@link AgentsWrites.create}.
 */
export interface AgentCreateInput {
  name: string;
  claudeMd?: string;
  seeds?: Record<string, string>;
}

/**
 * No-refetch agent writes for a host that owns its own read model (the web
 * engine-adapter under `reactivity:false`): each performs the SAME `POST`/
 * `PATCH`/`DELETE` as its {@link AgentsModule} sibling but does NOT call
 * `refresh()` afterward, and RETURNS the wire entity (`create`/`rename`) so the
 * host can update its cache without an extra `GET /agents`. The refetching
 * facade methods are untouched — iOS keeps using those verbatim.
 */
export interface AgentsWrites {
  /** `POST /agents` with the full body; returns the created agent (with id). */
  create(input: AgentCreateInput): Promise<WireAgent>;
  /** `PATCH /agents/:id`; returns the updated agent. */
  rename(id: string, name: string): Promise<WireAgent>;
  /** `DELETE /agents/:id`. */
  delete(id: string): Promise<void>;
}

/** The `agents` scope view-model: the WHOLE snapshot, republished on any change. */
export interface AgentsViewModel {
  /** False until the first successful list resolves; true thereafter. */
  loaded: boolean;
  items: AgentListItem[];
}

/** The reactive scope this module owns. */
export const AGENTS_SCOPE = "agents";

/** The command types this module registers. Typed to defeat string drift. */
export const AgentsCommand = {
  Refresh: "agents/refresh",
  Create: "agents/create",
  Rename: "agents/rename",
  Delete: "agents/delete",
} as const;
export type AgentsCommandType =
  (typeof AgentsCommand)[keyof typeof AgentsCommand];

/** The host wire-event `type` that means the agent list changed (protocol v3). */
export const AGENTS_CHANGED_EVENT = "AgentsChanged";
