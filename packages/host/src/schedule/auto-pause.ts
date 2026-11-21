import {
  autoPauseRoutine,
  loadRoutineRuns,
  loadRoutines,
  routineAutoPause,
  routineAutoPauseLogTail,
  saveRoutines,
  upsertById,
  withDocLock,
} from "@houston/domain";
import type { Routine } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { Vfs } from "../vfs";
import { withRunsFile } from "./runs-lock";

export async function pauseFailingRoutines(
  deps: { vfs: Vfs; events?: EventHub; now: () => Date },
  ws: Workspace,
  agent: Agent,
  root: string,
  routineIds: string[],
): Promise<Routine[]> {
  if (routineIds.length === 0) return [];
  const paused = await withRunsFile(root, () =>
    withDocLock(`${root}#routines`, async () => {
      const { items: runs } = await loadRoutineRuns(deps.vfs, root);
      const { items: routines } = await loadRoutines(deps.vfs, root);
      const nowIso = deps.now().toISOString();
      let next = routines;
      const done: Routine[] = [];
      for (const id of new Set(routineIds)) {
        const routine = routines.find((r) => r.id === id);
        const pause = routine ? routineAutoPause(routine, runs, nowIso) : null;
        if (!routine || !pause) continue;
        const updated = autoPauseRoutine(routine, pause);
        next = upsertById(next, updated);
        done.push(updated);
      }
      if (done.length > 0) await saveRoutines(deps.vfs, root, next);
      return done;
    }),
  );
  for (const routine of paused) {
    console.info(
      `[routine-auto-pause] paused ${agent.id}/${routine.id} after ${routineAutoPauseLogTail(routine.auto_paused)}`,
    );
  }
  if (paused.length > 0) {
    deps.events?.emit(ws.ownerUserId, {
      type: "RoutinesChanged",
      agentPath: agent.id,
    });
  }
  return paused;
}
