import { join } from "node:path";
import type { ChatMessage, WireFrame } from "@houston/runtime-client";
import { newUsedTokenCapture } from "../auth/used-token";
import { config } from "../config";
import { framePrompt } from "../session/attribution";
import { newInteractionHolder } from "../session/interaction";
import { snapshotWhenReady } from "./turn-deferred-files";
import { openTurnBackendSession } from "./turn-session-backend";
import { runInTurnContext } from "./turn-session-context";
import { handleTurnSessionFailure } from "./turn-session-failure";
import { modelCallsOutcome, newTurnFrames } from "./turn-session-frames";
import { promptTurnSession } from "./turn-session-prompt";
import type { RunTurnDeps } from "./turn-session-startup";
import { finishSuccessfulTurn } from "./turn-session-success";
import { armPooledTurnTitle, type PooledTurnTitle } from "./turn-session-title";
import type {
  TurnDirectories,
  TurnOutcome,
  TurnSessionRequest,
} from "./turn-session-types";
import { recordPooledUserTurn } from "./turn-session-user";

/**
 * One pi turn against resolved hydrated directories. Unlike chat.ts (one
 * long-lived process = one workspace, module
 * state), EVERYTHING here is per-request: auth storage, model registry,
 * session, tools. Nothing survives the request — that is the isolation story.
 *
 * Emits user/text/thinking/tool frames via `emit`; the TERMINAL frame is the
 * caller's job (it must sync the workspace back to object storage first, or a
 * client could see `done` before its files are durable).
 */

export type { RunTurnDeps } from "./turn-session-startup";
export type {
  TurnDirectories,
  TurnModelPin,
  TurnOutcome,
  TurnRunner,
  TurnSessionRequest,
} from "./turn-session-types";

export async function runTurn(
  directories: TurnDirectories,
  turn: TurnSessionRequest,
  deps: RunTurnDeps = {},
): Promise<TurnOutcome> {
  const { conversationId, text, provider, signal, pin, mode, turnId, author } =
    turn;
  const emit = (e: WireFrame) => turn.emit({ ...e, turnId });
  const { workspaceDir, dataDir } = directories;
  const conversationsDir = join(dataDir, "conversations");
  const { canonicalMessages, priorAuthors } = recordPooledUserTurn(
    dataDir,
    turn,
    emit,
  );

  const frames = newTurnFrames();
  /**
   * WHICH access token this turn ran on, for the revoked-token report
   * (auth/used-token.ts, PRODUCT-1319). This path's `ModelRuntime` uses pi's
   * OWN file-backed store (not `HoustonAuthStore`), so nothing records at
   * request time — instead the capture is SEEDED from the hydrated per-request
   * auth.json below. That read is exact here: the root is a throwaway copy
   * exclusive to this request, and its served entries are access-only (Gate
   * #2, no refresh token), so no re-serve or refresh can rotate the token
   * between the seed and a failure. Held outside the try so the catch can
   * still name the failed token.
   */
  const usedTokens = newUsedTokenCapture();
  // Set when the session autocompacted before the prompt: announced before
  // the prompt and persisted on the reply, like the standing server's.
  let compaction: ChatMessage["compaction"];
  let title: PooledTurnTitle | null = null;
  try {
    const opened = await openTurnBackendSession({
      directories,
      turn,
      deps,
      canonicalMessages,
      usedTokens,
    });
    const { replay, session, model, modelRuntime } = opened;
    compaction = opened.compaction;
    if (compaction) emit({ type: "context_compacted", data: compaction });

    // Snapshot the hydrated workspace so the turn's created/modified files can
    // be surfaced as a `file_changes` frame. The per-turn root is exclusive to
    // this request, so the diff is attributable by construction. Best-effort.
    const beforeFiles = snapshotWhenReady(
      workspaceDir,
      directories.workspaceReady,
    );

    // A fresh per-turn holder for whatever the model ends up waiting on the user
    // for (ask_user); established for the prompt's async subtree so the tool
    // records into it. Read after prompt() resolves, returned on the outcome.
    const interaction = newInteractionHolder();
    // A new mission's title starts when the model's response opens, so it
    // runs beside the reply (turn-session-title.ts).
    title = armPooledTurnTitle({
      turn,
      deps,
      directories,
      model,
      modelRuntime,
    });
    const startTitle = title?.start;
    const unsubTitle = startTitle
      ? session.subscribeAssistantMessageStart?.(() => startTitle())
      : undefined;
    // The context a standing runtime holds around its prompt (exec-turn.ts).
    await runInTurnContext(
      {
        conversationId,
        mode: mode ?? "execute",
        liveMode: turn.liveMode,
        model,
      },
      () =>
        promptTurnSession({
          session,
          backendId: opened.backendId,
          turn,
          prompt:
            (replay?.text ?? "") + framePrompt(text, author, priorAuthors),
          frames,
          interaction,
          usedTokens,
          stallTimeoutMs: deps.stallTimeoutMs ?? config.turnStallTimeoutMs,
          firstByteDeadlineMs:
            deps.firstByteDeadlineMs ?? config.turnFirstByteDeadlineMs,
          emit,
        }),
    ).finally(() => {
      unsubTitle?.();
      // Before the snapshot below waits on files no tool asked for.
      directories.abandonDeferred?.();
    });
    const outcome = finishSuccessfulTurn({
      beforeFiles: await beforeFiles,
      providerError: frames.providerError,
      workspaceDir,
      mode,
      assistantText: frames.assistantText,
      interaction,
      conversationsDir,
      conversationId,
      tools: frames.tools,
      usage: frames.usage,
      compaction,
      provider,
      turnId,
      emit,
    });
    // The spend a standing pod folds into its ledger after the same turn
    // (exec-turn.ts); the caller writes it to the store (turn-ledger.ts).
    if (frames.usage)
      outcome.spend = { provider: model.provider, usage: frames.usage };
    // The card write lands after the turn's own writes, as before; only the
    // title call itself overlaps the reply.
    const missionTitle = await title?.settle(
      frames.providerError !== undefined,
    );
    return {
      ...outcome,
      ...(frames.stopReason ? { stopReason: frames.stopReason } : {}),
      ...(missionTitle ? { missionTitle } : {}),
      ...modelCallsOutcome(frames, turnId),
    };
  } catch (error) {
    title?.abandon();
    const failed = handleTurnSessionFailure({
      error,
      signal,
      providerError: frames.providerError,
      assistantText: frames.assistantText,
      tools: frames.tools,
      usage: frames.usage,
      compaction,
      conversationsDir,
      conversationId,
      turnId,
      provider,
      model: pin?.model,
      text,
      usedTokens,
      emit,
    });
    const stopReason = frames.stopReason ?? turn.stopReason?.();
    return {
      ...failed,
      ...(stopReason ? { stopReason } : {}),
      ...modelCallsOutcome(frames, turnId),
    };
  }
}
