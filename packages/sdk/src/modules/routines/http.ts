/**
 * The routine-DEFINITION REST calls — what an agent repeats, and when — over
 * the injected `fetch`. The runs themselves (firing one now, stopping one under
 * way, the incoming-webhook key an outside service starts one with) live in
 * `runs.ts`, so each file is one lifecycle; both hang off the same `/agents/:id`
 * prefix.
 *
 * These are agent-proxy routes: the gateway forwards them to that agent's pod.
 * They go through {@link httpRequest} with literal paths rather than the runtime
 * client, which is what keeps them visible to the assistant's operation catalog.
 *
 * Nothing is swallowed here: a non-2xx always throws a {@link RoutinesHttpError}
 * carrying the HTTP `status`, so the caller — never this layer — decides whether
 * a `404` hides a surface or is a failure. A `401` additionally fires
 * {@link HttpScope.onUnauthorized}, so a lapsed session token becomes a visible
 * `tokenExpired` signal.
 */

import { type HttpScope, httpRequest } from "../http";
import type { NewRoutine, Routine, RoutineUpdate } from "./types";

/** A failed routine request. `status` is the upstream HTTP status. */
export class RoutinesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RoutinesHttpError";
  }
}

/**
 * Lists an agent's routines.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @assistant group:routines
 * @assistant unschematized: a routine's trigger_config is the outside app's own event shape.
 */
export async function listRoutines(
  scope: HttpScope,
  agentId: string,
): Promise<Routine[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/routines`,
  );
  return ((await res.json()) as { items: Routine[] }).items;
}

/**
 * Creates a routine so an agent repeats work on a schedule.
 *
 * Confirmed: money. A routine keeps firing on its own schedule once it exists,
 * spending model budget on every run until someone stops it.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param input The routine to create: a name, the instructions it runs
 *   (`prompt`), and WHEN it runs - either `schedule`, a cron expression, or
 *   `trigger`, an event binding. Exactly one of the two.
 * @assistant group:routines confirm
 * @assistant unschematized: a trigger binding carries the outside app's own event config, whose shape belongs to that app.
 */
export async function createRoutine(
  scope: HttpScope,
  agentId: string,
  input: NewRoutine,
): Promise<Routine> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/routines`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return (await res.json()) as Routine;
}

/**
 * Updates a routine's schedule or instructions.
 *
 * Confirmed: money. A schedule edit retargets recurring spend, changing how
 * often the agent runs and is billed from then on.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The routine to change, by the id listRoutines returns.
 * @param updates Only the fields that change; anything omitted is left as
 *   it was. `schedule` and `trigger` are the two wake mechanisms: setting one
 *   replaces the other.
 * @assistant group:routines confirm
 * @assistant unschematized: a trigger binding carries the outside app's own event config, whose shape belongs to that app.
 */
export async function updateRoutine(
  scope: HttpScope,
  agentId: string,
  id: string,
  updates: RoutineUpdate,
): Promise<Routine> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(updates) },
  );
  return (await res.json()) as Routine;
}

/**
 * Deletes a routine so it stops running on its schedule.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The routine to delete, by the id listRoutines returns.
 * @assistant group:routines confirm
 */
export async function deleteRoutine(
  scope: HttpScope,
  agentId: string,
  id: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
