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

export {
  type RoutinePauseAccount,
  type RoutinePauseNotice,
  type RoutinePauseRemedy,
  routinePauseNotice,
} from "./auto-pause";
export { routineFailureCode } from "./failure-code";
export type { RoutineReaderAccount } from "./failure-view";
export { type RoutinePin, routineFirePin } from "./fire-pin";
export { RoutinesHttpError } from "./http";
export {
  isPlanMinIntervalRefusal,
  planMinIntervalRefusal,
} from "./plan-floor-quiet";
export { viewerIsRoutineCreator } from "./routine-creator";
export { isRoutineGone } from "./routine-gone";
export { type RoutineSnoozeNotice, routineSnoozeNotice } from "./snooze";
export type {
  NewRoutine,
  Routine,
  RoutineRun,
  RoutineUpdate,
  WebhookKeyReveal,
} from "./types";
export { RoutinesCommand, type RoutinesCommandType } from "./types";
export {
  isWebhookKeyNotCreatorRefusal,
  WEBHOOK_KEY_NOT_CREATOR,
  type WebhookKeyAccess,
  type WebhookKeyViewer,
  webhookKeyAccess,
} from "./webhook-key-access";

export interface RoutinesModule {
  listRoutines(agentId: string): Promise<Routine[]>;
  listRoutineRuns(agentId: string): Promise<RoutineRun[]>;
  createRoutine(agentId: string, input: NewRoutine): Promise<Routine>;
  updateRoutine(
    agentId: string,
    id: string,
    updates: RoutineUpdate,
  ): Promise<Routine>;
  deleteRoutine(agentId: string, id: string): Promise<void>;
  runRoutineNow(agentId: string, id: string): Promise<void>;
  cancelRoutineRun(
    agentId: string,
    routineId: string,
    runId: string,
  ): Promise<RoutineRun>;
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
