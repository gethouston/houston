import {
  loadRoutines,
  routineSnoozeLogTail,
  saveRoutines,
  snoozeAfterRun,
  snoozeRoutine,
  unsnoozeAfterRun,
  upsertById,
  withDocLock,
} from "@houston/domain";
import type { Routine, RoutineRun } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { Vfs } from "../vfs";
import { pauseFailingRoutines } from "./auto-pause";

interface SettleDeps {
  vfs: Vfs;
  events?: EventHub;
  now: () => Date;
}

export async function settleRoutineRuns(
  deps: SettleDeps,
  ws: Workspace,
  agent: Agent,
  root: string,
  settled: readonly RoutineRun[],
): Promise<void> {
  if (settled.some((r) => r.failure?.code === "usage_limit" || isAnswer(r)))
    await snoozeOrLift(deps, ws, agent, root, settled);
  const streak = settled
    .filter((run) => run.failure && run.failure.code !== "usage_limit")
    .map((run) => run.routine_id);
  await pauseFailingRoutines(deps, ws, agent, root, streak);
}

const isAnswer = (run: RoutineRun) =>
  run.status === "silent" || run.status === "surfaced";

async function snoozeOrLift(
  deps: SettleDeps,
  ws: Workspace,
  agent: Agent,
  root: string,
  settled: readonly RoutineRun[],
): Promise<void> {
  const changed = await withDocLock(`${root}#routines`, async () => {
    const { items: routines } = await loadRoutines(deps.vfs, root);
    const nowIso = deps.now().toISOString();
    let next = routines;
    const done: Routine[] = [];
    for (const run of settled) {
      const routine = next.find((r) => r.id === run.routine_id);
      if (!routine) continue;
      const snooze = snoozeAfterRun(routine, run, nowIso);
      const updated = snooze
        ? snoozeRoutine(routine, snooze)
        : unsnoozeAfterRun(routine, run);
      if (!updated) continue;
      next = upsertById(next, updated);
      done.push(updated);
    }
    if (done.length > 0) await saveRoutines(deps.vfs, root, next);
    return done;
  });
  for (const routine of changed) {
    console.info(
      routine.snoozed
        ? `[routine-snooze] snoozed ${agent.id}/${routine.id}: ${routineSnoozeLogTail(routine.snoozed)}`
        : `[routine-snooze] lifted ${agent.id}/${routine.id}: a run answered`,
    );
  }
  if (changed.length > 0) {
    deps.events?.emit(ws.ownerUserId, {
      type: "RoutinesChanged",
      agentPath: agent.id,
    });
  }
}
