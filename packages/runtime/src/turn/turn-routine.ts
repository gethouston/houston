import {
  completeRoutineRun,
  createRoutineRun,
  holdsRoutineBusy,
  loadActivities,
  loadRoutineRuns,
  loadRoutines,
  pruneRoutineRuns,
  routineActivity,
  routineConversationId,
  routinePin,
  routinePrompt,
  routineTriggerPrompt,
  saveActivities,
  saveRoutineRuns,
  upsertById,
} from "@houston/domain";
import type { Routine, RoutineRun, RoutineRunFailure } from "@houston/protocol";
import { fsTextStore } from "./turn-fs-store";
import { lastAssistantReply, routineRunError } from "./turn-routine-reply";
import type { TurnRequest } from "./types";

export type RoutineTurnFailure = "no_routine" | "routine_busy";

export class RoutineTurnError extends Error {
  changed: readonly string[] = [];
  constructor(
    readonly code: RoutineTurnFailure,
    message: string,
  ) {
    super(message);
    this.name = "RoutineTurnError";
  }
}

export interface RoutinePhase {
  routine: Routine;
  run: RoutineRun;
  text: string;
  model?: string;
  effort?: string;
  provider: string | null;
  actingSub?: string | null;
}

export async function prepareRoutineTurn(
  workspaceDir: string,
  turn: TurnRequest,
  turnId: string,
  nowIso: string,
): Promise<RoutinePhase> {
  if (!turn.routine) throw new Error("prepareRoutineTurn without routine");
  const store = fsTextStore();
  const { items } = await loadRoutines(store, workspaceDir);
  const routine = items.find((r) => r.id === turn.routine?.id);
  if (!routine) {
    throw new RoutineTurnError(
      "no_routine",
      `routine ${turn.routine.id} not found in the agent's routines`,
    );
  }
  const expected = routineConversationId(routine, turnId);
  if (expected !== turn.conversationId) {
    throw new RoutineTurnError(
      "routine_busy",
      `conversation ${turn.conversationId} does not match the routine's ${expected}`,
    );
  }
  const { items: runs } = await loadRoutineRuns(store, workspaceDir);
  const nowMs = Date.parse(nowIso);
  const own = runs.find((r) => r.id === turnId);
  if (own && own.status !== "running") {
    throw new RoutineTurnError(
      "routine_busy",
      `run ${turnId} of "${routine.name}" already settled`,
    );
  }
  if (
    runs.some(
      (r) =>
        r.routine_id === routine.id &&
        r.id !== turnId &&
        holdsRoutineBusy(r, nowMs),
    )
  ) {
    throw new RoutineTurnError(
      "routine_busy",
      `"${routine.name}" is already running`,
    );
  }
  const run = createRoutineRun(routine, turnId, nowIso);
  await saveRoutineRuns(
    store,
    workspaceDir,
    pruneRoutineRuns([run, ...runs.filter((r) => r.id !== turnId)]),
  );
  const pin = routinePin(routine);
  const events = turn.routine.events ?? [];
  return {
    routine,
    run,
    text:
      events.length > 0
        ? routineTriggerPrompt(routine, events)
        : routinePrompt(routine),
    ...(pin.model ? { model: pin.model } : {}),
    ...(routine.effort ? { effort: routine.effort } : {}),
    provider: pin.provider,
    actingSub: turn.actingAs?.userId ?? null,
  };
}

export async function settleRoutineTurn(opts: {
  workspaceDir: string;
  phase: RoutinePhase;
  conversationId: string;
  turnError?: string;
  failure?: RoutineRunFailure;
  nowIso: string;
  newId: () => string;
}): Promise<RoutineRun | null> {
  const store = fsTextStore();
  const { items: runs } = await loadRoutineRuns(store, opts.workspaceDir);
  const row = runs.find((r) => r.id === opts.phase.run.id);
  if (row?.status !== "running") return null;
  const reply = await lastAssistantReply(
    opts.workspaceDir,
    opts.conversationId,
    row.id,
  );
  const done =
    routineRunError(row, reply, opts) ??
    completeRoutineRun(row, opts.phase.routine, reply.content, opts.nowIso);
  await saveRoutineRuns(store, opts.workspaceDir, upsertById(runs, done));
  if (done.status !== "surfaced") return done;
  const { items: activities } = await loadActivities(store, opts.workspaceDir);
  const existing = activities.find(
    (a) => a.session_key === opts.phase.run.session_key,
  );
  const activity = routineActivity(
    opts.phase.routine,
    done,
    existing,
    opts.newId(),
    opts.nowIso,
  );
  await saveActivities(
    store,
    opts.workspaceDir,
    upsertById(activities, activity),
  );
  return done;
}
