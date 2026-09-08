/**
 * The per-agent activities REST calls, over the injected `fetch`.
 *
 * The runtime client (`@houston/runtime-client`) is scoped to one conversation
 * and serves no typed `.houston` surface, so this module talks to the HOST's
 * `/agents/:id/activities` routes directly through `ports.fetch` — the SAME
 * routes `engine-adapter/control-plane.ts` uses. Auth rides the injected
 * `fetch` (the host wires a bearer-attaching `fetch`), exactly as the agents
 * module does.
 *
 * Errors never get swallowed: a non-2xx throws an {@link ActivitiesHttpError}
 * carrying the HTTP `status`, which `CommandRegistry.dispatch` surfaces as an
 * `ok: false` result. A `401` additionally fires {@link onUnauthorized} so a
 * lapsed session token becomes a visible `tokenExpired` signal.
 *
 * Assistant catalog: `listActivities` and `updateActivity` are annotated on the
 * control-plane side (`packages/web/src/engine-adapter/cp/board.ts`) and that
 * copy is the single source of truth — do NOT add a second `@assistant` block
 * for them here.
 */

import type { Activity, ActivityUpdate, NewActivity } from "@houston/protocol";
import type { SdkPorts } from "../../ports";
import { type HttpScope, httpRequest } from "../http";
import type { ActivitiesWrites } from "./types";

/** A failed `/activities` request. `status` is the upstream HTTP status. */
export class ActivitiesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ActivitiesHttpError";
  }
}

/** The activities operations the module (and mission search) need. */
export interface ActivitiesHttp {
  list(agentId: string): Promise<Activity[]>;
  create(agentId: string, input: NewActivity): Promise<Activity>;
  update(
    agentId: string,
    id: string,
    update: ActivityUpdate,
  ): Promise<Activity>;
  remove(agentId: string, id: string): Promise<void>;
}

export async function listActivities(
  scope: HttpScope,
  agentId: string,
): Promise<Activity[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/activities`,
  );
  return ((await res.json()) as { items: Activity[] }).items;
}

/**
 * Creates a mission on an agent's board.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param input The mission to put on the board: its title, and the
 *   description of the work.
 * @assistant group:missions unconfirmed: Creates a board draft without starting work or spending model tokens.
 */
export async function createActivity(
  scope: HttpScope,
  agentId: string,
  input: NewActivity,
): Promise<Activity> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/activities`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return (await res.json()) as Activity;
}

export async function updateActivity(
  scope: HttpScope,
  agentId: string,
  id: string,
  update: ActivityUpdate,
): Promise<Activity> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/activities/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(update) },
  );
  return (await res.json()) as Activity;
}

/**
 * Deletes a mission from an agent's board.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The mission to delete, by the id listActivities returns.
 * @assistant group:missions confirm
 */
export async function deleteActivity(
  scope: HttpScope,
  agentId: string,
  id: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/activities/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function createActivitiesHttp(
  baseUrl: string,
  ports: SdkPorts,
  onUnauthorized: () => void,
): ActivitiesHttp {
  const scope: HttpScope = {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized,
    fail: (message, status) =>
      new ActivitiesHttpError(
        message || `activities request failed: ${status}`,
        status,
      ),
  };

  return {
    list: (agentId) => listActivities(scope, agentId),
    create: (agentId, input) => createActivity(scope, agentId, input),
    update: (agentId, id, update) => updateActivity(scope, agentId, id, update),
    remove: (agentId, id) => deleteActivity(scope, agentId, id),
  };
}

/**
 * The no-refetch {@link ActivitiesWrites}: the underlying http ops surfaced
 * directly (returning the wire entity), with no post-write refresh. `setStatus`
 * and `rename` are the `update` PATCH with a `{ status }` / `{ title }` body —
 * the same wire writes the refetching facade issues, minus the refetch.
 */
export function createActivitiesWrites(http: ActivitiesHttp): ActivitiesWrites {
  return {
    create: (agentId, input) => http.create(agentId, input),
    setStatus: (agentId, id, status) => http.update(agentId, id, { status }),
    rename: (agentId, id, title) => http.update(agentId, id, { title }),
    delete: (agentId, id) => http.remove(agentId, id),
  };
}
