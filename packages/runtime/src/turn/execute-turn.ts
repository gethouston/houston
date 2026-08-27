import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { applyServedAzureEndpoint } from "../ai/azure-openai";
import { applyServedCredential } from "../auth/auth-file";
import { runWithActingContext } from "../session/acting-context";
import { releaseConversation, runWithConversationScope } from "../session/bus";
import { openSSE } from "../transport/sse";
import { startClaimHeartbeat } from "./claim-heartbeat";
import { piTurnRequest } from "./pi-turn-request";
import type { TurnServerDeps } from "./server-types";
import { finishTurnDurability } from "./turn-durability";
import { prepareTurnFilesystem } from "./turn-filesystem";
import { ownConversationOnly } from "./turn-hot-set";
import { TurnSetupError } from "./turn-layout";
import { createTurnLog } from "./turn-log";
import {
  prepareRoutineTurn,
  type RoutinePhase,
  RoutineTurnError,
  settleRoutineTurn,
} from "./turn-routine";
import { createTurnModelRuntime } from "./turn-runtime";
import { makeTurnSandboxFetch } from "./turn-sandbox";
import { runPiTurn, type TurnOutcome } from "./turn-session";
import { poolIdentity, resolveTurnStore } from "./turn-store";
import { turnSetupErrorFrame, turnTerminalFrame } from "./turn-terminal";
import { createTurnTranscript } from "./turn-transcript";
import type { TurnRequest } from "./types";

/** Execute one admitted turn inside an isolated, disposable filesystem root. */
export async function executeTurn(
  deps: TurnServerDeps,
  turn: TurnRequest,
  req: IncomingMessage,
  res: ServerResponse,
  timings: Record<string, number>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "houston-turn-"));
  timings.t_tmpdir = performance.now();
  const scope = `${turn.workspaceId}/${turn.agentId}`;
  const abort = new AbortController();
  // A CLAIMED turn's lifetime is the claim, not the HTTP connection: the
  // gateway may lose its stream and re-attach through the turnlog, so a
  // dropped socket must not abort the work; a fenced heartbeat (the claim was
  // released or adopted) must. Unclaimed turns keep the connection contract.
  if (!turn.claim) req.on("close", () => abort.abort());
  const turnId = turn.turnId ?? crypto.randomUUID();
  let heartbeat: ReturnType<typeof startClaimHeartbeat> | null = null;
  let turnSandbox: ReturnType<typeof makeTurnSandboxFetch> | null = null;
  let closeSse: (() => void) | undefined;
  try {
    const resolved = resolveTurnStore(turn, deps.store, {
      poolStoreUrl: deps.poolStoreUrl,
      fetchImpl: deps.fetchImpl,
    });
    heartbeat =
      turn.claim && turn.hostToken
        ? startClaimHeartbeat({
            claim: turn.claim,
            hostToken: turn.hostToken,
            onFenced: () => abort.abort(),
            ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
            ...(deps.heartbeatIntervalMs
              ? { intervalMs: deps.heartbeatIntervalMs }
              : {}),
          })
        : null;
    const filesystem = await prepareTurnFilesystem({
      store: resolved.store,
      prefix: resolved.prefix,
      root,
      claimed: Boolean(turn.claim),
      ...(deps.maxHydrateBytes !== undefined
        ? { maxBytes: deps.maxHydrateBytes }
        : {}),
      // A pool turn hydrates its own conversation's history only: the other
      // conversations are the bulk of a busy agent and nothing in a turn
      // reads them. An unclaimed (legacy per-workspace) runtime keeps the
      // full tree.
      ...(turn.claim
        ? { filter: ownConversationOnly(turn.conversationId) }
        : {}),
    });
    timings.t_hydrated = performance.now();
    const { dataDir } = filesystem;
    if (turn.grant && turn.hostToken) {
      const identity = poolIdentity(turn.gcsPrefix);
      turnSandbox = makeTurnSandboxFetch({
        grant: turn.grant,
        hostToken: turn.hostToken,
        store: resolved.store,
        prefix: resolved.prefix,
        filesystem,
        workspaceId: turn.workspaceId,
        conversationId: turn.conversationId,
        ...(turn.actingAs ? { actingAs: turn.actingAs } : {}),
        orgSlug: identity.org,
        agentSlug: identity.agent,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
    }
    const authPath = join(dataDir, "auth.json");
    if (turn.credential) {
      applyServedCredential(authPath, turn.credential);
      // Azure's per-resource endpoint rides the served credential; land it in
      // THIS turn's hydrated root so model resolution finds a base URL even
      // when this agent never ran the connect itself (PRODUCT-1532).
      applyServedAzureEndpoint(
        turn.credential.provider,
        turn.credential.enterpriseUrl,
        dataDir,
      );
    }
    timings.t_cred_written = performance.now();

    const sse = openSSE(res);
    closeSse = sse.close;
    timings.t_sse_open = performance.now();
    const turnLog = createTurnLog(deps, turn);
    const transcript = createTurnTranscript(
      deps,
      { ...turn, turnId },
      filesystem,
    );
    const emit = (frame: WireFrame) => {
      sse.send(turnLog ? turnLog.record(frame) : frame);
      // The runtime persists the user message right before this frame; land
      // its transcript row now so a gateway that restarts mid-turn can rebuild
      // the turn. Errors are remembered and surfaced at durability time.
      if (frame.type === "user") void transcript?.publishUser();
    };

    if (turn.shadow) {
      try {
        if (!turn.credential) throw new Error("shadow turn needs a credential");
        await createTurnModelRuntime(
          dataDir,
          turn.provider || turn.credential.provider,
          turn.model,
          timings,
        );
        emit({
          type: "shadow",
          data: { ...timings, hydratedObjects: filesystem.manifest.size },
          turnId,
          // SAFETY: shadow is an internal turn-server control frame. It uses
          // the WireFrame transport without entering the public protocol.
        } as unknown as WireFrame);
        emit({ type: "done", data: null, turnId });
      } catch (error) {
        emit({
          type: "error",
          data: {
            message: error instanceof Error ? error.message : String(error),
          },
          turnId,
        });
      }
    } else {
      let outcome: TurnOutcome;
      // A routine fire derives its prompt and pins from the agent's own
      // routine file (the prompt authority), records the running row, and
      // gates double-fires — the worker-side twin of the host's
      // fireRoutineRun. Typed failures terminate the turn with a machine
      // code the dispatcher settles the fire from.
      let routinePhase: RoutinePhase | null = null;
      let effectiveTurn = turn;
      if (turn.routine) {
        try {
          routinePhase = await prepareRoutineTurn(
            filesystem.workspaceDir,
            turn,
            turnId,
            new Date().toISOString(),
          );
          effectiveTurn = {
            ...turn,
            text: routinePhase.text,
            // The routine's pinned provider is the routine's own statement of
            // what it runs on — it must outrank the dispatcher-attached
            // credential's provider, or a mismatched serve silently moves the
            // fire onto a provider the routine never picked (PRODUCT-1515).
            ...(routinePhase.provider
              ? { provider: routinePhase.provider }
              : {}),
            ...(routinePhase.model ? { model: routinePhase.model } : {}),
            ...(routinePhase.effort ? { effort: routinePhase.effort } : {}),
            mode: "auto",
          };
        } catch (error) {
          const code =
            error instanceof RoutineTurnError ? error.code : "routine_error";
          emit({
            type: "error",
            data: {
              message: error instanceof Error ? error.message : String(error),
              code,
            },
            turnId,
          } as WireFrame);
          await turnLog?.flush();
          return;
        }
      }
      if (!turn.credential) {
        emit({
          type: "user",
          data: {
            content: turn.text,
            ts: Date.now(),
            nonce: turn.nonce,
            mentions: turn.mentions,
          },
          turnId,
        });
        outcome = {
          error: "No provider connected. Connect your subscription first.",
        };
      } else {
        const run = deps.runTurn ?? runPiTurn;
        try {
          outcome = await runWithConversationScope(scope, () =>
            runWithActingContext(
              {
                credentialScopeKey: `u:turn:${turn.workspaceId}:${turn.agentId}`,
                authPath,
                ...(turn.actingAs ? { actingUser: turn.actingAs.userId } : {}),
              },
              () =>
                run(
                  filesystem,
                  piTurnRequest(
                    effectiveTurn,
                    turnId,
                    emit,
                    abort.signal,
                    turnSandbox ? { call: turnSandbox.call } : undefined,
                  ),
                ),
            ),
          );
        } catch (error) {
          outcome = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      if (routinePhase) {
        // The run row must leave "running" and land in the tree BEFORE the
        // claimed sync-back uploads it — never a stuck row, never silent.
        try {
          await settleRoutineTurn({
            workspaceDir: filesystem.workspaceDir,
            phase: routinePhase,
            conversationId: turn.conversationId,
            ...(outcome.error ? { turnError: outcome.error } : {}),
            nowIso: new Date().toISOString(),
            newId: () => crypto.randomUUID(),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          outcome = {
            ...outcome,
            error: outcome.error
              ? `${outcome.error}; routine settle failed: ${message}`
              : `routine settle failed: ${message}`,
          };
        }
      }

      const durable = await finishTurnDurability({
        deps,
        turn: { ...turn, turnId },
        filesystem,
        resolved,
        heartbeat,
        outcome,
        transcript,
      });
      outcome = durable.outcome;
      emit(
        turnTerminalFrame(
          outcome,
          turnId,
          durable.poolWritesOutOfScope,
          durable.transcriptSkipped,
          durable.activityDocSkipped,
          durable.changed,
        ),
      );
      await turnLog?.flush();
    }
  } catch (error) {
    if (!(error instanceof TurnSetupError)) throw error;
    const sse = openSSE(res);
    closeSse = sse.close;
    sse.send(turnSetupErrorFrame(error, turnId));
  } finally {
    try {
      await turnSandbox?.dispose().catch((error: unknown) => {
        console.error(
          `[turn] sandbox dispose failed (${error instanceof Error ? error.name : typeof error})`,
        );
      });
    } finally {
      try {
        await heartbeat?.stop();
      } finally {
        releaseConversation(scope, turn.conversationId);
        try {
          await rm(root, { recursive: true, force: true });
        } finally {
          closeSse?.();
        }
      }
    }
  }
}
