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
  const usedTokens = newUsedTokenCapture();
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

    const beforeFiles = snapshotWhenReady(
      workspaceDir,
      directories.deferredGate,
    );

    const interaction = newInteractionHolder();
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
    await runInTurnContext(
      {
        conversationId,
        mode: mode ?? "execute",
        liveMode: turn.liveMode,
        model,
        dataDir,
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
      usedTokens,
      emit,
    });
    if (frames.usage)
      outcome.spend = { provider: model.provider, usage: frames.usage };
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
