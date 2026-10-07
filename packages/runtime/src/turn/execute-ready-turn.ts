import type { WireFrame } from "@houston/runtime-client";
import type { startClaimHeartbeat } from "./claim-heartbeat";
import type { TurnServerDeps } from "./server-types";
import { finishTurnDurability } from "./turn-durability";
import type { EarlyTurnSession } from "./turn-early-session";
import type { TurnFilesystem } from "./turn-filesystem";
import type { createTurnLog } from "./turn-log";
import { landedMissionTitle } from "./turn-mission-title-outcome";
import { remoteActivityReader } from "./turn-mission-title-remote";
import {
  turnIsUnconnected,
  turnSessionRequest,
  unconnectedTurnOutcome,
} from "./turn-request";
import { RoutineTurnError } from "./turn-routine";
import { finishRoutineTurn } from "./turn-routine-finish";
import { routinePhaseTurn, startRoutineRun } from "./turn-routine-start";
import { unconnectedRoutineTurn } from "./turn-routine-unconnected";
import type { makeTurnSandboxFetch } from "./turn-sandbox";
import { runInTurnScope } from "./turn-scope";
import { runTurn, type TurnOutcome } from "./turn-session";
import type { TurnSessionStartupTask } from "./turn-session-startup";
import { landTurnSideWrites } from "./turn-side-writes";
import type { resolveTurnStore } from "./turn-store";
import { durableTerminalFrame } from "./turn-terminal";
import type { createTurnTranscript } from "./turn-transcript";
import type { TurnRequest } from "./types";

/** Run a fully hydrated non-shadow turn, then make its writes durable. */
export async function executeReadyTurn(input: {
  deps: TurnServerDeps;
  turn: TurnRequest;
  turnId: string;
  root: string;
  authPath: string;
  signal: AbortSignal;
  filesystem: TurnFilesystem;
  resolved: ReturnType<typeof resolveTurnStore>;
  heartbeat: ReturnType<typeof startClaimHeartbeat> | null;
  sandbox: ReturnType<typeof makeTurnSandboxFetch> | null;
  startup?: TurnSessionStartupTask;
  /** The session the turn opened while it hydrated (turn-early-session.ts). */
  early?: EarlyTurnSession;
  timings: Record<string, number>;
  emit: (frame: WireFrame) => void;
  turnLog: ReturnType<typeof createTurnLog>;
  transcript: ReturnType<typeof createTurnTranscript>;
}): Promise<void> {
  let routinePhase = null;
  let effectiveTurn = input.turn;
  if (input.turn.routine) {
    try {
      routinePhase = await startRoutineRun({
        ...input,
        nowIso: new Date().toISOString(),
      });
      effectiveTurn = routinePhaseTurn(input.turn, routinePhase);
    } catch (error) {
      const code =
        error instanceof RoutineTurnError ? error.code : "routine_error";
      input.emit({
        type: "error",
        data: {
          message: error instanceof Error ? error.message : String(error),
          code,
        },
        turnId: input.turnId,
      } as WireFrame);
      await input.turnLog?.flush();
      return;
    }
  }

  let outcome: TurnOutcome;
  if (turnIsUnconnected(input.turn)) {
    outcome = unconnectedTurnOutcome(input.turn, input.turnId, input.emit);
  } else {
    try {
      outcome = await runInTurnScope(
        {
          turn: input.turn,
          authPath: input.authPath,
          poolStoreUrl: input.deps.poolStoreUrl,
        },
        () => {
          const directories = { ...input.filesystem, turnRoot: input.root };
          const request = turnSessionRequest(
            effectiveTurn,
            input.turnId,
            input.emit,
            input.signal,
            input.sandbox
              ? { call: input.sandbox.call, warmCode: input.sandbox.warmCode }
              : undefined,
            input.timings,
            input.startup,
            input.early,
          );
          // The card may postdate hydration: its title rebases the tree's
          // board onto a fresh store read (turn-mission-title-remote.ts).
          if (request.missionTitle)
            request.readRemoteActivity = remoteActivityReader(
              input.resolved.store,
              input.resolved.prefix,
              input.filesystem,
            );
          return input.deps.runTurn
            ? input.deps.runTurn(directories, request)
            : runTurn(directories, request, input.deps.turnSessionDeps);
        },
      );
    } catch (error) {
      outcome = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Any path that never prompted (unconnected, a setup failure) is over too.
  input.filesystem.abandonDeferred?.();
  let afterSync: Awaited<ReturnType<typeof finishRoutineTurn>>["afterSync"];
  if (routinePhase) {
    const finished = await finishRoutineTurn({
      store: input.resolved.store,
      prefix: input.resolved.prefix,
      filesystem: input.filesystem,
      phase: routinePhase,
      conversationId: input.turn.conversationId,
      ...(outcome.error ? { turnError: outcome.error } : {}),
      unconnected: unconnectedRoutineTurn(
        input.turn,
        effectiveTurn.provider,
        input.filesystem.dataDir,
      ),
    });
    const failed = finished.error;
    if (failed)
      outcome = {
        ...outcome,
        error: outcome.error ? `${outcome.error}; ${failed}` : failed,
      };
    afterSync = finished.afterSync;
  }

  input.timings.t_run_done = performance.now();
  const [durable] = await Promise.all([
    finishTurnDurability({
      deps: input.deps,
      turn: { ...input.turn, turnId: input.turnId },
      filesystem: input.filesystem,
      resolved: input.resolved,
      heartbeat: input.heartbeat,
      outcome,
      transcript: input.transcript,
      ...(input.sandbox ? { views: input.sandbox.views() } : {}),
      ...(afterSync ? { afterSync } : {}),
    }),
    landTurnSideWrites({
      store: input.resolved.store,
      prefix: input.resolved.prefix,
      filesystem: input.filesystem,
      root: input.root,
      conversationId: input.turn.conversationId,
      userId: input.turn.actingAs?.userId,
      spend: outcome.spend,
    }),
  ]);
  input.timings.t_durable = performance.now();
  input.emit(
    durableTerminalFrame(
      durable,
      input.turnId,
      input.timings,
      {
        hydratedObjects: input.filesystem.manifest.size,
        skippedObjects: input.filesystem.skippedObjects,
      },
      input.turn.missionTitle
        ? landedMissionTitle(outcome.missionTitle, durable.sync)
        : undefined,
      outcome.modelCalls,
    ),
  );
  await input.turnLog?.flush();
}
