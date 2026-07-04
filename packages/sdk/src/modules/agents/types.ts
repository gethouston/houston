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
 * `Agent` record in `packages/host/src/domain/types.ts`). No cosmetic overlay
 * fields (color, assignment) — those are hosted-gateway extras the base host
 * route does not serve, so the SDK does not invent them.
 */
export interface WireAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
}

/** A single agent inside the `agents` scope snapshot. */
export interface AgentListItem {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: number;
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
