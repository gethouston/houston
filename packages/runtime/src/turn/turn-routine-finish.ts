import {
  routineAutoPauseLogTail,
  routineSnoozeLogTail,
  unconnectedRoutineFailure,
} from "@houston/domain";
import type { RoutineRun, RoutineRunFailure } from "@houston/protocol";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { type TurnFilesystem, turnRoutineRunsKey } from "./turn-filesystem";
import { type RoutinePhase, settleRoutineTurn } from "./turn-routine";
import {
  autoPauseRoutineTurn,
  snoozeRoutineTurn,
} from "./turn-routine-auto-pause";

export interface FinishedRoutineTurn {
  error?: string;
  afterSync?: (landed: readonly string[]) => Promise<string | undefined>;
}

export async function finishRoutineTurn(opts: {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  phase: RoutinePhase;
  conversationId: string;
  turnError?: string;
  unconnected?: { provider?: string } | undefined;
}): Promise<FinishedRoutineTurn> {
  const failure: RoutineRunFailure | undefined = opts.unconnected
    ? unconnectedRoutineFailure(opts.unconnected.provider)
    : undefined;
  let settled: Awaited<ReturnType<typeof settleRoutineTurn>>;
  try {
    settled = await settleRoutineTurn({
      workspaceDir: opts.filesystem.workspaceDir,
      phase: opts.phase,
      conversationId: opts.conversationId,
      ...(opts.turnError ? { turnError: opts.turnError } : {}),
      ...(failure ? { failure } : {}),
      nowIso: new Date().toISOString(),
      newId: () => crypto.randomUUID(),
    });
  } catch (error) {
    return {
      error: `routine settle failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!settled) return {};
  const answered = settled.status === "silent" || settled.status === "surfaced";
  if (
    settled.failure?.code === "usage_limit" ||
    (answered && opts.phase.routine.snoozed)
  )
    return { afterSync: () => snoozeNow(opts, settled) };
  if (!settled.failure) return {};
  const runsKey = turnRoutineRunsKey(opts.filesystem.workspaceRel);
  return {
    afterSync: async (landed) => {
      if (!landed.includes(runsKey)) return undefined;
      return pauseIfEarned(opts);
    },
  };
}

async function snoozeNow(
  opts: {
    store: ObjectStore;
    prefix: string;
    filesystem: TurnFilesystem;
    phase: RoutinePhase;
  },
  run: RoutineRun,
): Promise<string | undefined> {
  try {
    const changed = await snoozeRoutineTurn({
      store: opts.store,
      prefix: opts.prefix,
      filesystem: opts.filesystem,
      routineId: opts.phase.routine.id,
      run,
      actingSub: opts.phase.actingSub,
      nowIso: new Date().toISOString(),
    });
    if (changed)
      console.info(
        changed.snoozed
          ? `[routine-snooze] snoozed ${changed.id}: ${routineSnoozeLogTail(changed.snoozed)}`
          : `[routine-snooze] lifted ${changed.id}: a run answered`,
      );
    return undefined;
  } catch (error) {
    return `routine snooze failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function pauseIfEarned(opts: {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  phase: RoutinePhase;
}): Promise<string | undefined> {
  try {
    const paused = await autoPauseRoutineTurn({
      store: opts.store,
      prefix: opts.prefix,
      filesystem: opts.filesystem,
      routineId: opts.phase.routine.id,
      nowIso: new Date().toISOString(),
    });
    if (paused)
      console.info(
        `[routine-auto-pause] paused ${paused.id} after ${routineAutoPauseLogTail(paused.auto_paused)}`,
      );
    return undefined;
  } catch (error) {
    return `routine auto-pause failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
