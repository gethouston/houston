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
