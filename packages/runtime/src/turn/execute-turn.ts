import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { openSSE } from "../transport/sse";
import { startClaimHeartbeat } from "./claim-heartbeat";
import { executeReadyTurn } from "./execute-ready-turn";
import { executeShadowTurn } from "./execute-shadow-turn";
import type { TurnServerDeps } from "./server-types";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { cleanupTurn } from "./turn-cleanup";
import { writeTurnCredential } from "./turn-credential";
import type { TurnFilesystemPreparation } from "./turn-filesystem";
import { TurnSetupError } from "./turn-layout";
import { createTurnLog } from "./turn-log";
import { setActiveTurnTimings } from "./turn-network-marks";
import { stampPooledTurn } from "./turn-push";
import { turnSessionRequest } from "./turn-request";
import { prepareTurnRoot } from "./turn-root";
import type { makeTurnSandboxFetch } from "./turn-sandbox";
import { createTurnSandbox } from "./turn-sandbox-startup";
import {
  reportAbandonedTurnStartup,
  startTurnSession,
  type TurnSessionStartupTask,
} from "./turn-session-startup";
import { answerTurnSetupFailure } from "./turn-setup-failure";
import { snapshotPooledTurnSharedSkills } from "./turn-shared-skills";
import { createTurnEmitter } from "./turn-sse-emitter";
import { poolIdentity, resolveTurnStore } from "./turn-store";
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
  const root = await prepareTurnRoot(turn);
  timings.t_tmpdir = performance.now();
  setActiveTurnTimings(timings);
  const scope = `${turn.workspaceId}/${turn.agentId}`;
  const abort = new AbortController();
  // A CLAIMED turn's lifetime is the claim, not the HTTP connection: the
  // gateway may lose its stream and re-attach through the turnlog, so a
  // dropped socket must not abort the work; a fenced heartbeat (the claim was
  // released or adopted) must. Unclaimed turns keep the connection contract.
  if (!turn.claim) req.on("close", () => abort.abort());
  turn.liveMode = { current: turn.mode ?? "execute" };
  const turnId = turn.turnId ?? crypto.randomUUID();
  let heartbeat: ReturnType<typeof startClaimHeartbeat> | null = null;
  let turnSandbox: ReturnType<typeof makeTurnSandboxFetch> | null = null;
  let preparation: TurnFilesystemPreparation | undefined;
  let startup: TurnSessionStartupTask | undefined;
  let closeSse: (() => void) | undefined;
  try {
    const sandboxIdentity =
      turn.grant && turn.hostToken ? poolIdentity(turn.gcsPrefix) : undefined;
    const storeConfig = {
      poolStoreUrl: deps.poolStoreUrl,
      fetchImpl: deps.fetchImpl,
    };
    const resolved = resolveTurnStore(turn, deps.store, storeConfig);
    heartbeat =
      turn.claim && turn.hostToken
        ? startClaimHeartbeat({
            claim: turn.claim,
            hostToken: turn.hostToken,
            onFenced: () => abort.abort(),
            onMode: (mode) => {
              if (turn.liveMode) turn.liveMode.current = mode;
            },
            ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
            ...(deps.heartbeatIntervalMs
              ? { intervalMs: deps.heartbeatIntervalMs }
              : {}),
          })
        : null;
    preparation = await startTurnRequestFilesystem({
      store: resolved.store,
      prefix: resolved.prefix,
      root,
      turn,
      ...(deps.maxHydrateBytes !== undefined
        ? { maxBytes: deps.maxHydrateBytes }
        : {}),
      timings,
    });
    const filesystem = preparation.filesystem;
    const { dataDir } = filesystem;
    turnSandbox = createTurnSandbox({
      deps,
      turn,
      identity: sandboxIdentity,
      resolved,
      filesystem,
    });
    const authPath = join(dataDir, "auth.json");
    if (turn.credential) {
      writeTurnCredential(
        authPath,
        turn.credential,
        dataDir,
        deps.writeTurnCredential,
      );
    }
    timings.t_cred_written = performance.now();

    let sendFrame: ((frame: WireFrame) => void) | undefined;
    const earlyEmit = (frame: WireFrame) => sendFrame?.(frame);
    if (turn.credential && !turn.routine && !turn.shadow && !deps.runTurn) {
      startup = startTurnSession(
        { ...filesystem, turnRoot: root },
        turnSessionRequest(
          turn,
          turnId,
          earlyEmit,
          abort.signal,
          turnSandbox
            ? { call: turnSandbox.call, warmCode: turnSandbox.warmCode }
            : undefined,
          timings,
        ),
        deps.turnSessionDeps,
      );
    }

    try {
      await preparation.hydrated;
      timings.t_hydrated = performance.now();
      const refused = await turnSandbox?.admission();
      if (refused) throw new TurnSetupError("message_refused", refused);
    } catch (error) {
      await reportAbandonedTurnStartup(startup);
      throw error;
    }
    // Setup can no longer refuse the turn: answer (the gateway's 202) now.
    const sse = openSSE(res);
    closeSse = sse.close;
    timings.t_sse_open = performance.now();
    if (!turn.shadow)
      await snapshotPooledTurnSharedSkills(deps, turn, storeConfig, {
        root,
        workspaceDir: filesystem.workspaceDir,
        timings,
      });
    const turnLog = createTurnLog(deps, turn);
    if (!turn.shadow)
      await stampPooledTurn({ deps, turn, turnId, filesystem, resolved });
    const transcript = createTurnTranscript(
      deps,
      { ...turn, turnId },
      filesystem,
    );
    const emit = createTurnEmitter(sse.send, turnSandbox, turnLog, transcript);
    sendFrame = emit;

    if (turn.shadow)
      await executeShadowTurn({ turn, turnId, filesystem, timings, emit });
    else
      await executeReadyTurn({
        deps,
        turn,
        turnId,
        root,
        scope,
        authPath,
        signal: abort.signal,
        filesystem,
        resolved,
        heartbeat,
        sandbox: turnSandbox,
        startup,
        timings,
        emit,
        turnLog,
        transcript,
      });
  } catch (error) {
    if (!(error instanceof TurnSetupError)) throw error;
    closeSse = await answerTurnSetupFailure({ deps, turn, turnId, error, res });
  } finally {
    await cleanupTurn({
      root,
      scope,
      conversationId: turn.conversationId,
      heartbeat,
      sandbox: turnSandbox,
      hydration: preparation,
      hydrationSettleTimeoutMs: deps.hydrationSettleTimeoutMs,
      removeRoot: deps.removeTurnRoot,
      closeSse,
    });
  }
}
