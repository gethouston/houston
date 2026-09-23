/**
 * The routines module — an agent's ROUTINES: the work it repeats on a schedule,
 * the record of the times it ran, and the incoming-webhook key an outside
 * service starts one with.
 *
 * These are pure commands: a routine screen opens them, reads once, and writes
 * from a form, while the host announces every change on its own
 * `RoutinesChanged` / `RoutineRunsChanged` invalidation — so there is no
 * reactive scope to publish here and no write refetches. The same handlers back
 * both the typed facade and the `dispatch` path.
 *
 * SEAM — agent-scoped, but NOT through `clientFor(agentId)`: the routine routes
 * are the gateway's agent-proxy paths and the webhook mint is a gateway control
 * route, so the module talks to both through the SDK's own HTTP seam with
 * literal paths (which is also what keeps them in the assistant's catalog). A
 * 401 routes through the shared {@link ModuleContext.authExpiry} notifier.
 *
 * Degradations are the CALLER's: every request throws on a non-2xx, 404
 * included, so a surface that wants "webhook keys unsupported here" instead of
 * an error says so itself and no surface is handed a silent `null` it did not
 * ask for.
 */

import type { ModuleContext } from "../../module-context";
import { moduleScope } from "../http";
import { requireString } from "../payload";
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  RoutinesHttpError,
  updateRoutine,
} from "./http";
import {
  cancelRoutineRun,
  listRoutineRuns,
  mintRoutineWebhookKey,
  runRoutineNow,
} from "./runs";
import {
  type NewRoutine,
  type Routine,
  type RoutineRun,
  RoutinesCommand,
  type RoutineUpdate,
  requireNewRoutine,
  requireRoutineUpdate,
  type WebhookKeyReveal,
} from "./types";

export { RoutinesHttpError } from "./http";
export type {
  NewRoutine,
  Routine,
  RoutineRun,
  RoutineUpdate,
  WebhookKeyReveal,
} from "./types";
export { RoutinesCommand, type RoutinesCommandType } from "./types";

/** The typed facade for an agent's scheduled work. */
export interface RoutinesModule {
  /** Every routine defined on an agent. */
  listRoutines(agentId: string): Promise<Routine[]>;
  /** The agent's routine-run history, newest state included. */
  listRoutineRuns(agentId: string): Promise<RoutineRun[]>;
  /** Define a new routine; it starts firing on its own wake mechanism. */
  createRoutine(agentId: string, input: NewRoutine): Promise<Routine>;
  /** Change a routine's instructions, wake mechanism or overrides. */
  updateRoutine(
    agentId: string,
    id: string,
    updates: RoutineUpdate,
  ): Promise<Routine>;
  /** Delete a routine so it stops firing. */
  deleteRoutine(agentId: string, id: string): Promise<void>;
  /** Fire a routine now instead of waiting for its next scheduled time. */
  runRoutineNow(agentId: string, id: string): Promise<void>;
  /** Stop a routine run that is currently under way. */
  cancelRoutineRun(
    agentId: string,
    routineId: string,
    runId: string,
  ): Promise<RoutineRun>;
  /** Mint (or rotate) the routine's incoming-webhook key; the secret is shown once. */
  mintRoutineWebhookKey(
    agentId: string,
    routineId: string,
  ): Promise<WebhookKeyReveal>;
}

export function createRoutinesModule(ctx: ModuleContext): RoutinesModule {
  const scope = moduleScope(ctx, "routines", RoutinesHttpError);

  ctx.registerCommand(RoutinesCommand.List, (p) =>
    listRoutines(scope, requireString(p, "agentId")),
  );
  ctx.registerCommand(RoutinesCommand.ListRuns, (p) =>
    listRoutineRuns(scope, requireString(p, "agentId")),
  );
  ctx.registerCommand(RoutinesCommand.Create, (p) =>
    createRoutine(scope, requireString(p, "agentId"), requireNewRoutine(p)),
  );
  ctx.registerCommand(RoutinesCommand.Update, (p) =>
    updateRoutine(
      scope,
      requireString(p, "agentId"),
      requireString(p, "id"),
      requireRoutineUpdate(p),
    ),
  );
  ctx.registerCommand(RoutinesCommand.Delete, (p) =>
    deleteRoutine(scope, requireString(p, "agentId"), requireString(p, "id")),
  );
  ctx.registerCommand(RoutinesCommand.RunNow, (p) =>
    runRoutineNow(scope, requireString(p, "agentId"), requireString(p, "id")),
  );
  ctx.registerCommand(RoutinesCommand.CancelRun, (p) =>
    cancelRoutineRun(
      scope,
      requireString(p, "agentId"),
      requireString(p, "routineId"),
      requireString(p, "runId"),
    ),
  );
  ctx.registerCommand(RoutinesCommand.MintWebhookKey, (p) =>
    mintRoutineWebhookKey(
      scope,
      requireString(p, "agentId"),
      requireString(p, "routineId"),
    ),
  );

  return {
    listRoutines: (agentId) => listRoutines(scope, agentId),
    listRoutineRuns: (agentId) => listRoutineRuns(scope, agentId),
    createRoutine: (agentId, input) => createRoutine(scope, agentId, input),
    updateRoutine: (agentId, id, updates) =>
      updateRoutine(scope, agentId, id, updates),
    deleteRoutine: (agentId, id) => deleteRoutine(scope, agentId, id),
    runRoutineNow: (agentId, id) => runRoutineNow(scope, agentId, id),
    cancelRoutineRun: (agentId, routineId, runId) =>
      cancelRoutineRun(scope, agentId, routineId, runId),
    mintRoutineWebhookKey: (agentId, routineId) =>
      mintRoutineWebhookKey(scope, agentId, routineId),
  };
}
