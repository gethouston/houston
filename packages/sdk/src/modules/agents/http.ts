/**
 * The agent-list REST calls, over the injected `fetch`.
 *
 * The runtime client (`@houston/runtime-client`) is scoped to ONE conversation
 * and exposes no agent-list surface, so this module talks to the host's
 * `/agents` routes directly through `ports.fetch` — the same routes
 * `control-plane.ts` uses. Auth rides the injected `fetch` (the host wires a
 * `fetch` that attaches the bearer), exactly as the kernel constructs the
 * runtime client without a token.
 *
 * Errors never get swallowed: a non-2xx throws an {@link AgentsHttpError}
 * carrying the HTTP `status`, which `CommandRegistry.dispatch` surfaces as an
 * `ok: false` result. A `401` additionally fires {@link onUnauthorized} so a
 * lapsed session token becomes a visible `tokenExpired` signal.
 *
 * Assistant catalog: these functions are its single source of truth for
 * the `/agents` routes, so each carries its own `@assistant` block and the
 * generator reads the route straight off the call it makes here.
 */

import { type AgentColorId, withInitialConfigSeed } from "@houston/domain";
import { WireAgentSchema } from "@houston/wire-types";
import {
  type HttpScope,
  httpRequest,
  moduleScope,
  type ScopeContext,
  SdkHttpError,
} from "../http";
import type { AgentCreateInput, WireAgent } from "./types";

/** A failed `/agents` request. `status` is the upstream HTTP status. */
export class AgentsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "AgentsHttpError");
  }
}

/** The four agent-list operations the module needs. */
export interface AgentsHttp {
  list(): Promise<WireAgent[]>;
  create(input: AgentCreateInput): Promise<WireAgent>;
  rename(id: string, name: string): Promise<WireAgent>;
  remove(id: string): Promise<void>;
}

/**
 * Lists the user's agents, including each employee's `timezone`. Write a routine's
 * cron in that employee's local time and never add a time zone to the schedule.
 * @assistant group:agents
 */
export async function listAgents(scope: HttpScope): Promise<WireAgent[]> {
  const res = await httpRequest(scope, "/agents");
  return WireAgentSchema.array().parse(await res.json());
}

/**
 * Creates a new agent. Always choose a `color` for it, one of the app's ten
 * palette colors: charcoal, forest, teal, navy, purple, rose, crimson, orange,
 * golden, or umber. It is how the new agent is told apart at a glance, and
 * leaving it out gives every agent the same default color.
 *
 * `JSON.stringify` drops the undefined optionals, so a plain create posts just
 * `{ name }` and a seeded one posts the fields it was given, in this order.
 *
 * @param name What to call the new agent, in the user's own words. Each
 *   agent's name is its own: a name another agent already has, in any letter
 *   case, is refused as taken, so tell the user and ask for another. Your own
 *   name is reserved for you, so no agent can take it (names that only
 *   contain it are fine): tell the user the name is yours and suggest
 *   another.
 * @param color One of the app's ten palette colours: charcoal, forest,
 *   teal, navy, purple, rose, crimson, orange, golden or umber.
 * @param seed Optional starting files for the new agent. Omit it for a
 *   blank one. A new hire's seeds carry `.houston/config/config.json` holding
 *   `{"firstDay":"pending"}`, which offers the user the button that starts its
 *   first day (see startFirstDay).
 * @assistant group:agents
 * @assistant confirm: money. An agent is a billed unit with its own workspace and running engine, so creating one adds recurring cost the user has to want.
 * @assistant unschematized: the seed's seeds map is an open record of file path to contents.
 */
export async function createAgent(
  scope: HttpScope,
  name: string,
  color?: AgentColorId,
  seed?: {
    claudeMd?: string;
    seeds?: Record<string, string>;
  },
): Promise<WireAgent> {
  const res = await httpRequest(scope, "/agents", {
    method: "POST",
    body: JSON.stringify({
      name,
      color,
      claudeMd: seed?.claudeMd,
      seeds: seed?.seeds,
    }),
  });
  return WireAgentSchema.parse(await res.json());
}

/**
 * Re-creates an agent the person already had on their desktop, during the
 * move to the cloud. The same `POST /agents` as {@link createAgent} plus
 * `migration: true`, which keeps the agent's name even when it is the AI
 * Manager's reserved one; a name another agent holds is still refused.
 *
 * @assistant group:agents
 * @assistant hidden: it keeps a desktop agent's name even when that name is Houston, which the AI Manager may never give an employee; createAgent is the create to dispatch.
 * @assistant hands: unreachable the move runs from the desktop app's move-to-cloud screen, which the person starts themselves.
 * @assistant unroutable: the migration flag is a constant this create always sends, not a parameter a route can map.
 * @assistant unschematized: the seed's seeds map is an open record of file path to contents.
 */
export async function createMigratedAgent(
  scope: HttpScope,
  name: string,
  color?: AgentColorId,
  seed?: {
    claudeMd?: string;
    seeds?: Record<string, string>;
  },
): Promise<WireAgent> {
  const res = await httpRequest(scope, "/agents", {
    method: "POST",
    body: JSON.stringify({
      name,
      color,
      claudeMd: seed?.claudeMd,
      seeds: seed?.seeds,
      migration: true,
    }),
  });
  return WireAgentSchema.parse(await res.json());
}

/**
 * Renames an agent.
 *
 * @param id The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param name The new name, in the user's own words. Another agent's name,
 *   in any letter case, is refused as taken. Your own name is reserved for
 *   you, so an agent cannot be renamed to it: tell the user the name is yours
 *   and suggest another.
 * @assistant group:agents
 * @assistant confirm: outward. Everyone in the space sees the agent under its new name, and on a desktop its files move with it.
 */
export async function renameAgent(
  scope: HttpScope,
  id: string,
  name: string,
): Promise<WireAgent> {
  const res = await httpRequest(scope, `/agents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return WireAgentSchema.parse(await res.json());
}

/**
 * Deletes an agent and everything in it.
 *
 * @param id The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @assistant group:agents
 * @assistant confirm: irreversible. The agent goes, and so does every mission, chat and file inside it, with no copy kept.
 */
export async function deleteAgent(scope: HttpScope, id: string): Promise<void> {
  await httpRequest(scope, `/agents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * The transport scope every agents request runs on. Shared with `library.ts`
 * and mission search so the account-scoped agent routes fail with the same
 * {@link AgentsHttpError} and route the same 401 into the auth-expiry signal.
 */
export function agentsScope(ctx: ScopeContext): HttpScope {
  return moduleScope(ctx, "agents", AgentsHttpError);
}

export function createAgentsHttp(scope: HttpScope): AgentsHttp {
  return {
    list: () => listAgents(scope),
    // The initial config becomes the config document among the seeds, so the
    // wire stays the create every host and gateway already honors.
    create: ({ name, color, claudeMd, seeds, config, migration }) =>
      (migration ? createMigratedAgent : createAgent)(scope, name, color, {
        claudeMd,
        seeds: withInitialConfigSeed(seeds, config),
      }),
    rename: (id, name) => renameAgent(scope, id, name),
    remove: (id) => deleteAgent(scope, id),
  };
}
