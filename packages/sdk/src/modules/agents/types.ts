/**
 * Wire + view-model types and the typed string constants for the agents module.
 *
 * The `agents` scope snapshot is the SDK-canonical version of what the web
 * control-plane adapter builds today (`packages/engine-adapter/
 * control-plane.ts` `listAgents`): the host's `GET /agents` list, republished
 * whole on every change. Everything here is plain JSON — it crosses the
 * `getSnapshot`/`subscribe` boundary unchanged.
 */

import type { AgentColorId } from "@houston/domain";
import type { AgentInitialConfig } from "@houston/protocol";
import type { WireAgent } from "@houston/wire-types";

/** Teams v2: how much of a shared agent the caller may do. */
export type AgentAccess = "manager" | "user";

/** One member's access level for a shared agent. */
export interface AgentAssignment {
  userId: string;
  access: AgentAccess;
}

export type { WireAgent } from "@houston/wire-types";

/** One agent template installed into the account's library. */
export interface InstalledConfig {
  /** The template's own config document, whose shape is the template's. */
  config: unknown;
  /** Where the library keeps it, as the install routes address it. */
  path: string;
}

/** A single agent inside the `agents` scope snapshot. */
export interface AgentListItem {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: number;
  /** The role its job description names, when it names one. */
  role?: string;
  /** The zone this employee's routines run in. */
  timezone?: string;
}

/**
 * The full create body the host's `POST /agents` accepts (protocol v3): a
 * required `name`, an optional palette `color` the host records in the
 * account's `agent_colors` preference, plus the optional seed payload a rich
 * create carries — `claudeMd` (the agent's CLAUDE.md) and `seeds` (a
 * relative-path → contents map the host writes into the new agent).
 * `JSON.stringify` drops the undefined optionals, so a `{ name }` create posts
 * exactly `{ name }` on the wire (the shape the existing
 * {@link AgentsModule.create} facade and the `agents/create` command send).
 * Used by the no-refetch {@link AgentsWrites.create}.
 *
 * A surface that keeps colour in its own client overlay (the web agent picker)
 * leaves `color` out and paints from the overlay; one that has no overlay (a
 * portable install, a template) sends it so the new agent is born coloured.
 */
export interface AgentCreateInput {
  name: string;
  color?: AgentColorId;
  claudeMd?: string;
  seeds?: Record<string, string>;
  /**
   * The config the agent is born with (its brain, and a new hire's pending
   * first day), folded into `seeds` as its config document so it lands in the
   * create itself (`withInitialConfigSeed`).
   */
  config?: AgentInitialConfig;
  /**
   * The desktop-to-cloud move re-creating an agent the person already had:
   * the create keeps its name even when it is the AI Manager's reserved one
   * (a name another agent holds is still refused).
   */
  migration?: boolean;
}

/**
 * No-refetch agent writes for a host that owns its own read model (the web
 * engine-adapter under `reactivity:false`): each performs the SAME `POST`/
 * `PATCH`/`DELETE` as its {@link AgentsModule} sibling but does NOT call
 * `refresh()` afterward, and RETURNS the wire entity (`create`/`rename`) so the
 * host can update its cache without an extra `GET /agents`. The refetching
 * facade methods stay the default for a host with no read model of its own.
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
  SetColor: "agents/setColor",
  InstallFromGithub: "agents/installFromGithub",
  StartFirstDay: "agents/startFirstDay",
} as const;
export type AgentsCommandType =
  (typeof AgentsCommand)[keyof typeof AgentsCommand];

/** The host wire-event `type` that means the agent list changed (protocol v3). */
export const AGENTS_CHANGED_EVENT = "AgentsChanged";

/** The host wire-event `type` that means one agent's listed `role` changed. */
export const AGENT_ROLE_CHANGED_EVENT = "AgentRoleChanged";

/** Pull a required non-empty string off an untrusted command payload. */
