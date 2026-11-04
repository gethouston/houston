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

import { type HttpScope, httpRequest, SdkHttpError } from "../http";
import { isRoutineGone } from "./routine-gone";
import type { NewRoutine, Routine, RoutineUpdate } from "./types";

/** A failed routine request. `status` is the upstream HTTP status. */
export class RoutinesHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "RoutinesHttpError");
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
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param input The routine to create: a name, the instructions it runs
 *   (`prompt`), and WHEN it runs - either `schedule` or `trigger`, an event
 *   binding. Exactly one of the two. `schedule` is a cron expression, or
 *   `@every <N>m` / `@every <N>h` for every N minutes or hours when N does not
 *   divide 60 (or 24) evenly (`@every 16m`; never mixed units like `1h30m`).
 *   Without an explicit model, Anthropic uses claude-sonnet-5-5 and
 *   openai-codex uses gpt-6.1-terra, with an effort that model serves.
 *   Other providers inherit the agent's model. An explicit model wins.
 * @assistant group:routines
 * @assistant confirm: money. A routine keeps firing on its own schedule once it exists, spending model budget on every run until someone stops it.
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
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The routine to change, by the id listRoutines returns.
 * @param updates Only the fields that change; anything omitted is left as
 *   it was. `schedule` and `trigger` are the two wake mechanisms: setting one
 *   replaces the other. `schedule` takes the same forms as createRoutine's
 *   (cron, or `@every <N>m` / `@every <N>h`). `enabled: true` resumes a paused routine, including one
 *   the engine paused itself after repeated account or model failures
 *   (`auto_paused`); fix what `auto_paused.reason` names first, or the next
 *   runs fail the same way. When `auto_paused.cause` is `no_model`, the
 *   routine has no model: set its `provider` and `model` to a connected one.
 *   A routine with `snoozed` is enabled but held until `snoozed.until`
 *   because its account's plan usage limit is reached; it resumes by itself
 *   then, and setting another `model` (or `provider`) lets it run sooner.
 * @assistant group:routines
 * @assistant confirm: money. A schedule edit retargets recurring spend, changing how often the agent runs and is billed from then on.
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
 * Deletes a routine so it stops running on its schedule. The route answers
 * 404 with code `routine_not_found` when no routine has that id.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The routine to delete, by the id listRoutines returns.
 * @assistant group:routines
 * @assistant confirm: irreversible. The schedule and the instructions it ran are gone, and the routine has to be written again from scratch.
 */
export async function deleteRoutine(
  scope: HttpScope,
  agentId: string,
  id: string,
): Promise<void> {
  try {
    await httpRequest(
      scope,
      `/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    // Idempotent for SDK callers (the catalog's raw route still answers the
    // 404): the routine was deleted elsewhere or listed from a stale mirror,
    // and the end state already holds. The worker that answered re-projects
    // the routines doc; if that doc PUT fails it logs an error and the row
    // can reappear on the next list read until a later projection lands.
    if (isRoutineGone(error)) return;
    throw error;
  }
}
