import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { openSSE } from "../transport/sse";
import type { startClaimHeartbeat } from "./claim-heartbeat";
import { executeReadyTurn } from "./execute-ready-turn";
import { executeShadowTurn } from "./execute-shadow-turn";
import type { TurnServerDeps } from "./server-types";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { cleanupTurn } from "./turn-cleanup";
import { writeTurnCredential } from "./turn-credential";
import {
  type EarlyTurnSession,
  startEarlyTurnSession,
} from "./turn-early-session";
import type { TurnFilesystemPreparation } from "./turn-filesystem";
import { startTurnHeartbeat } from "./turn-heartbeat";
import { TurnSetupError } from "./turn-layout";
import { createTurnLog } from "./turn-log";
import { setActiveTurnTimings } from "./turn-network-marks";
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
  let earlySession: EarlyTurnSession | undefined;
  let closeSse: (() => void) | undefined;
  try {
    const sandboxIdentity =
      turn.grant && turn.hostToken ? poolIdentity(turn.gcsPrefix) : undefined;
    const storeConfig = {
      poolStoreUrl: deps.poolStoreUrl,
      fetchImpl: deps.fetchImpl,
    };
    const resolved = resolveTurnStore(turn, deps.store, storeConfig);
    heartbeat = startTurnHeartbeat(deps, turn, abort);
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
    const directories = { ...filesystem, turnRoot: root };
    const request = turnSessionRequest(
      turn,
      turnId,
      earlyEmit,
      abort.signal,
      turnSandbox
        ? { call: turnSandbox.call, warmCode: turnSandbox.warmCode }
        : undefined,
      timings,
    );
    if (turn.credential && !turn.routine && !turn.shadow && !deps.runTurn)
      startup = startTurnSession(directories, request, deps.turnSessionDeps);

    try {
      await preparation.hydrated;
      timings.t_hydrated = performance.now();
      earlySession = startEarlyTurnSession({
        turn,
        request: { ...request, ...(startup ? { startup } : {}) },
        directories,
        authPath,
        poolStoreUrl: deps.poolStoreUrl,
      });
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
    const transcript = createTurnTranscript(
      deps,
      { ...turn, turnId },
      filesystem,
    );
    const emit = (raw: WireFrame) => {
      const frame = turnSandbox ? turnSandbox.present(raw) : raw;
      sse.send(turnLog ? turnLog.record(frame) : frame);
      // The runtime persists the user message right before this frame; land
      // its transcript row now so a gateway that restarts mid-turn can rebuild
      // the turn. Errors are remembered and surfaced at durability time.
      if (frame.type === "user") void transcript?.publishUser();
    };
    sendFrame = emit;

    if (turn.shadow)
      await executeShadowTurn({ turn, turnId, filesystem, timings, emit });
    else
      await executeReadyTurn({
        deps,
        turn,
        turnId,
        root,
        authPath,
        signal: abort.signal,
        filesystem,
        resolved,
        heartbeat,
        sandbox: turnSandbox,
        startup,
        early: earlySession,
        timings,
        emit,
        turnLog,
        transcript,
      });
  } catch (error) {
    if (!(error instanceof TurnSetupError)) throw error;
    closeSse = await answerTurnSetupFailure({ deps, turn, turnId, error, res });
  } finally {
    // The early CLI writes into the root until it exits: stop it first.
    await earlySession?.close();
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
