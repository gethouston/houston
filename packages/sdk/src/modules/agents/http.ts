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
 * Assistant catalog: `listAgents` and `createAgent` are annotated on the
 * control-plane side (`packages/web/src/engine-adapter/cp/agents.ts`) and that
 * copy is the single source of truth — do NOT add a second `@assistant` block
 * for them here.
 */

import type { SdkPorts } from "../../ports";
import { type HttpScope, httpRequest } from "../http";
import type { AgentCreateInput, WireAgent } from "./types";

/** A failed `/agents` request. `status` is the upstream HTTP status. */
export class AgentsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentsHttpError";
  }
}

/** The four agent-list operations the module needs. */
export interface AgentsHttp {
  list(): Promise<WireAgent[]>;
  create(input: AgentCreateInput): Promise<WireAgent>;
  rename(id: string, name: string): Promise<WireAgent>;
  remove(id: string): Promise<void>;
}

export async function listAgents(scope: HttpScope): Promise<WireAgent[]> {
  const res = await httpRequest(scope, "/agents");
  return (await res.json()) as WireAgent[];
}

export async function createAgent(
  scope: HttpScope,
  input: AgentCreateInput,
): Promise<WireAgent> {
  // `JSON.stringify` drops undefined optionals, so a `{ name }` input posts
  // exactly `{ "name": … }` — byte-identical to the legacy body iOS sends.
  const res = await httpRequest(scope, "/agents", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as WireAgent;
}

/**
 * Renames an agent.
 *
 * @param id The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param name The new name, in the user's own words.
 * @assistant group:agents confirm
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
  return (await res.json()) as WireAgent;
}

/**
 * Deletes an agent and everything in it.
 *
 * @param id The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @assistant group:agents confirm
 */
export async function deleteAgent(scope: HttpScope, id: string): Promise<void> {
  await httpRequest(scope, `/agents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function createAgentsHttp(
  baseUrl: string,
  ports: SdkPorts,
  onUnauthorized: () => void,
): AgentsHttp {
  const scope: HttpScope = {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized,
    fail: (message, status) =>
      new AgentsHttpError(
        message || `agents request failed: ${status}`,
        status,
      ),
  };

  return {
    list: () => listAgents(scope),
    create: (input) => createAgent(scope, input),
    rename: (id, name) => renameAgent(scope, id, name),
    remove: (id) => deleteAgent(scope, id),
  };
}
