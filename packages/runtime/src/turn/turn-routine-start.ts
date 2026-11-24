import type { WireFrame } from "@houston/runtime-client";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { healRoutinesMirror } from "./op-routine-heal";
import type { TurnServerDeps } from "./server-types";
import { mutateTurnDocument, TurnDocConflictError } from "./turn-doc-cas";
import { type TurnFilesystem, turnRoutineRunsKey } from "./turn-filesystem";
import type { TurnLanded } from "./turn-landed";
import type { createTurnLog } from "./turn-log";
import {
  prepareRoutineTurn,
  type RoutinePhase,
  RoutineTurnError,
} from "./turn-routine";
import type { TurnRequest } from "./types";

export async function answerRoutineStartFailure(
  input: {
    turnId: string;
    emit: (frame: WireFrame) => void;
    turnLog: ReturnType<typeof createTurnLog>;
    mentionReport?: Promise<void>;
  },
  error: unknown,
): Promise<void> {
  await input.mentionReport;
  input.emit({
    type: "error",
    data: {
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof RoutineTurnError ? error.code : "routine_error",
      ...(error instanceof RoutineTurnError && error.changed.length > 0
        ? { changed: error.changed }
        : {}),
    },
    turnId: input.turnId,
  } as WireFrame);
  await input.turnLog?.flush();
}

/**
 * Start a pooled routine run against the STORE's run history, not only the
 * hydrated copy: the runs gate reads the history refreshed and merged by run
 * id, and the running row is uploaded under its generation before the turn
 * runs, then projected into the run history doc. While the run executes the
 * app shows it (and its Stop button), and an overlapping fire of the routine
 * in another sandbox meets it at the gate. A sandbox that dies leaves the
 * row running; the control plane's reconcile op settles it once (the gate
 * ignores it past ROUTINE_RUN_TIMEOUT_MS meanwhile).
 *
 * Never from the hydrated copy when the store refuses: that copy may miss
 * another fire's running row or a cancel, and a refusal may mean this
 * worker lost its claim. A history that kept changing under every attempt
 * reads as busy (the dispatcher retries the fire); any other failure fails
 * the run's start.
 */
export async function startRoutineRun(input: {
  deps: TurnServerDeps;
  turn: TurnRequest;
  turnId: string;
  filesystem: TurnFilesystem;
  resolved: { store: ObjectStore; prefix: string };
  nowIso: string;
  landed: Pick<TurnLanded, "settled">;
}): Promise<RoutinePhase> {
  const { filesystem, turn, turnId, nowIso } = input;
  let phase: RoutinePhase;
  try {
    phase = await mutateTurnDocument({
      store: input.resolved.store,
      prefix: input.resolved.prefix,
      filesystem,
      relativePath: turnRoutineRunsKey(filesystem.workspaceRel),
      apply: () =>
        prepareRoutineTurn(filesystem.workspaceDir, turn, turnId, nowIso),
    });
  } catch (error) {
    if (error instanceof TurnDocConflictError)
      throw new RoutineTurnError(
        "routine_busy",
        `run history changed under every attempt to start ${turnId}`,
      );
    if (error instanceof RoutineTurnError && error.code === "no_routine")
      error.changed = await healMissingRoutine(input);
    throw error;
  }
  await input.landed.settled();
  return phase;
}

/**
 * A run-now the gateway dispatched off its asleep routines mirror for a
 * routine the store lacks: re-project the routines doc under this turn's
 * claim BEFORE the error frame goes out, so the refetch that follows the
 * gateway's 404 reads the healed list instead of the same ghost.
 */
async function healMissingRoutine(input: {
  deps: TurnServerDeps;
  turn: TurnRequest;
  filesystem: TurnFilesystem;
  resolved: { store: ObjectStore; prefix: string };
}): Promise<string[]> {
  const { turn } = input;
  if (turn.shadow || !turn.claim || !turn.hostToken || !turn.routine) return [];
  return healRoutinesMirror(
    input.deps,
    {
      gcsPrefix: turn.gcsPrefix,
      hostToken: turn.hostToken,
      claim: { token: turn.claim.token, bootId: turn.claim.bootId },
      conversationId: turn.conversationId,
    },
    input.resolved,
    input.filesystem.workspaceRel,
    turn.routine.id,
  );
}

/** The turn a routine phase runs: its prompt, its pin, and Autopilot. */
export function routinePhaseTurn(
  turn: TurnRequest,
  phase: RoutinePhase,
): TurnRequest {
  return {
    ...turn,
    text: phase.text,
    ...(phase.provider ? { provider: phase.provider } : {}),
    ...(phase.model ? { model: phase.model } : {}),
    ...(phase.effort ? { effort: phase.effort } : {}),
    mode: "auto",
  };
}
