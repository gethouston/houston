import type { WireFrame } from "@houston/runtime-client";
import { runWithActingContext } from "../session/acting-context";
import { runWithConversationScope } from "../session/bus";
import type { startClaimHeartbeat } from "./claim-heartbeat";
import type { TurnServerDeps } from "./server-types";
import { finishTurnDurability } from "./turn-durability";
import type { TurnFilesystem } from "./turn-filesystem";
import type { createTurnLog } from "./turn-log";
import { turnSessionRequest } from "./turn-request";
import {
  prepareRoutineTurn,
  RoutineTurnError,
  settleRoutineTurn,
} from "./turn-routine";
import type { makeTurnSandboxFetch } from "./turn-sandbox";
import { runTurn, type TurnOutcome } from "./turn-session";
import type { TurnSessionStartupTask } from "./turn-session-startup";
import type { resolveTurnStore } from "./turn-store";
import { turnTerminalFrame } from "./turn-terminal";
import type { createTurnTranscript } from "./turn-transcript";
import type { TurnRequest } from "./types";

/** Run a fully hydrated non-shadow turn, then make its writes durable. */
export async function executeReadyTurn(input: {
  deps: TurnServerDeps;
  turn: TurnRequest;
  turnId: string;
  root: string;
  scope: string;
  authPath: string;
  signal: AbortSignal;
  filesystem: TurnFilesystem;
  resolved: ReturnType<typeof resolveTurnStore>;
  heartbeat: ReturnType<typeof startClaimHeartbeat> | null;
  sandbox: ReturnType<typeof makeTurnSandboxFetch> | null;
  startup?: TurnSessionStartupTask;
  timings: Record<string, number>;
  emit: (frame: WireFrame) => void;
  turnLog: ReturnType<typeof createTurnLog>;
  transcript: ReturnType<typeof createTurnTranscript>;
}): Promise<void> {
  let routinePhase = null;
  let effectiveTurn = input.turn;
  if (input.turn.routine) {
    try {
      routinePhase = await prepareRoutineTurn(
        input.filesystem.workspaceDir,
        input.turn,
        input.turnId,
        new Date().toISOString(),
      );
      effectiveTurn = {
        ...input.turn,
        text: routinePhase.text,
        ...(routinePhase.provider ? { provider: routinePhase.provider } : {}),
        ...(routinePhase.model ? { model: routinePhase.model } : {}),
        ...(routinePhase.effort ? { effort: routinePhase.effort } : {}),
        mode: "auto",
      };
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
  if (!input.turn.credential) {
    input.emit({
      type: "user",
      data: {
        content: input.turn.text,
        ts: Date.now(),
        nonce: input.turn.nonce,
        mentions: input.turn.mentions,
      },
      turnId: input.turnId,
    });
    outcome = {
      error: "No provider connected. Connect your subscription first.",
    };
  } else {
    try {
      outcome = await runWithConversationScope(input.scope, () =>
        runWithActingContext(
          {
            credentialScopeKey: `u:turn:${input.turn.workspaceId}:${input.turn.agentId}`,
            authPath: input.authPath,
            ...(input.turn.actingAs
              ? { actingUser: input.turn.actingAs.userId }
              : {}),
          },
          () => {
            const directories = {
              ...input.filesystem,
              turnRoot: input.root,
            };
            const request = turnSessionRequest(
              effectiveTurn,
              input.turnId,
              input.emit,
              input.signal,
              input.sandbox ? { call: input.sandbox.call } : undefined,
              input.timings,
              input.startup,
            );
            return input.deps.runTurn
              ? input.deps.runTurn(directories, request)
              : runTurn(directories, request, input.deps.turnSessionDeps);
          },
        ),
      );
    } catch (error) {
      outcome = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (routinePhase) {
    try {
      await settleRoutineTurn({
        workspaceDir: input.filesystem.workspaceDir,
        phase: routinePhase,
        conversationId: input.turn.conversationId,
        ...(outcome.error ? { turnError: outcome.error } : {}),
        nowIso: new Date().toISOString(),
        newId: () => crypto.randomUUID(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome = {
        ...outcome,
        error: outcome.error
          ? `${outcome.error}; routine settle failed: ${message}`
          : `routine settle failed: ${message}`,
      };
    }
  }

  input.timings.t_run_done = performance.now();
  const durable = await finishTurnDurability({
    deps: input.deps,
    turn: { ...input.turn, turnId: input.turnId },
    filesystem: input.filesystem,
    resolved: input.resolved,
    heartbeat: input.heartbeat,
    outcome,
    transcript: input.transcript,
    ...(input.sandbox ? { views: input.sandbox.views() } : {}),
  });
  input.timings.t_durable = performance.now();
  input.emit(
    turnTerminalFrame(
      durable.outcome,
      input.turnId,
      durable.poolWritesOutOfScope,
      durable.transcriptSkipped,
      durable.activityDocSkipped,
      durable.changed,
      input.timings,
    ),
  );
  await input.turnLog?.flush();
}
