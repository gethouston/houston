import { mkdir, mkdtemp } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { openSSE } from "../transport/sse";
import { startClaimHeartbeat } from "./claim-heartbeat";
import { executeReadyTurn } from "./execute-ready-turn";
import { executeShadowTurn } from "./execute-shadow-turn";
import type { TurnServerDeps } from "./server-types";
import { cleanupTurn } from "./turn-cleanup";
import { writeTurnCredential } from "./turn-credential";
import {
  startTurnFilesystem,
  type TurnFilesystemPreparation,
} from "./turn-filesystem";
import { ownConversationOnly } from "./turn-hot-set";
import { TurnSetupError } from "./turn-layout";
import { createTurnLog } from "./turn-log";
import { turnSessionRequest } from "./turn-request";
import type { makeTurnSandboxFetch } from "./turn-sandbox";
import { createTurnSandbox } from "./turn-sandbox-startup";
import {
  reportAbandonedTurnStartup,
  startTurnSession,
  type TurnSessionStartupTask,
} from "./turn-session-startup";
import { poolIdentity, resolveTurnStore } from "./turn-store";
import { turnSetupErrorFrame } from "./turn-terminal";
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
  await Promise.all([
    mkdir(join(root, "home"), { recursive: true }),
    mkdir(join(root, "claude-credstore"), { recursive: true }),
  ]);
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
  let preparation: TurnFilesystemPreparation | undefined;
  let startup: TurnSessionStartupTask | undefined;
  let closeSse: (() => void) | undefined;
  try {
    const sandboxIdentity =
      turn.grant && turn.hostToken ? poolIdentity(turn.gcsPrefix) : undefined;
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
    preparation = await startTurnFilesystem({
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
          turnSandbox ? { call: turnSandbox.call } : undefined,
          timings,
        ),
        deps.turnSessionDeps,
      );
    }

    try {
      await preparation.hydrated;
      timings.t_hydrated = performance.now();
    } catch (error) {
      await reportAbandonedTurnStartup(startup);
      throw error;
    }

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
    const sse = openSSE(res);
    closeSse = sse.close;
    sse.send(turnSetupErrorFrame(error, turnId));
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
