import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { logTurnTarget } from "../ai/turn-diagnostic";
import { readAuthFile } from "../auth/auth-file";
import type { newUsedTokenCapture } from "../auth/used-token";
import { hasUnreadablePiSessionTail } from "../backends/pi/backend";
import { replayCharBudget } from "../session/replay-transcript";
import { replayForConversation } from "../session/routine-replay";
import { estimateTokens } from "../session/token-estimate";
import { autocompactPooledSession } from "./turn-autocompact";
import { adoptEarlyTurnSession } from "./turn-early-session";
import { routineReplayHistory } from "./turn-routine-context";
import { openTurnHarness } from "./turn-session-open";
import {
  finishTurnSessionStartup,
  type RunTurnDeps,
  startTurnSession,
} from "./turn-session-startup";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session-types";

/** Finish overlapped setup and open a backend session from hydrated state. */
export async function openTurnBackendSession(input: {
  directories: TurnDirectories;
  turn: TurnSessionRequest;
  deps: RunTurnDeps;
  canonicalMessages: ChatMessage[];
  usedTokens: ReturnType<typeof newUsedTokenCapture>;
}) {
  const { turn, directories } = input;
  const { provider, pin, conversationId, turnId } = turn;
  // Opened while the worker answered (turn-early-session.ts), else below.
  const early = await adoptEarlyTurnSession(turn.early);
  const setup =
    early ??
    (await finishTurnSessionStartup(
      turn.startup ?? startTurnSession(directories, turn, input.deps),
    ));
  const { model } = setup;
  const turnCred = readAuthFile(join(directories.dataDir, "auth.json"))[
    provider
  ];
  if (turnCred?.type === "oauth" && turnCred.access)
    input.usedTokens.record(provider, turnCred.access);
  const diagnostic = model as unknown as { id?: string; baseUrl?: string };
  // Same one-line form the long-lived runtime logs (ai/turn-diagnostic.ts), so
  // desktop and pod logs read identically. `pinned` speaks for the MODEL only:
  // a pooled turn's provider always arrives on the request (this runtime holds
  // no saved pick), while the model is a per-turn pin over the hydrated
  // settings.json / provider default (turn-model.ts).
  logTurnTarget({
    provider,
    model: diagnostic.id,
    baseUrl: diagnostic.baseUrl,
    pinned: Boolean(pin?.model),
  });
  const opened =
    early ??
    (await openTurnHarness({
      directories,
      turn,
      startup: setup,
      piResumeUnreadable: () =>
        input.canonicalMessages.length > 0 &&
        hasUnreadablePiSessionTail(
          join(directories.dataDir, "sessions", conversationId),
        ),
    }));
  const { session, modelRuntime, harness, routineReset } = opened;
  // A routine chat replays the same archive-aware tail the standing server
  // reads, bounded by the routine budget; every other chat keeps its hydrated
  // live file and the budget it always had here (routine-replay.ts). Built
  // only when a session actually starts without its history: the tail can
  // reach into archive segments, which a resumed run must never parse.
  const replayOf = () =>
    replayForConversation({
      conversationId,
      messages: routineReplayHistory(
        directories.dataDir,
        conversationId,
        turnId,
        input.canonicalMessages,
      ),
      currentTurnId: turnId,
      currentPrompt: turn.text,
      windowTokens: routineReset?.windowTokens ?? opened.catalogWindow,
      charBudget: replayCharBudget(model.contextWindow),
    });
  // An armed Claude summary IS the history the new session starts from.
  const replay =
    opened.freshSession ||
    (harness === "claude" && !opened.claudeResume && !opened.armedSummary)
      ? replayOf()
      : null;
  // Claude's fallback when the SDK refuses its resume: deferred until then.
  opened.setRetryReplay(() => (replay ?? replayOf())?.text ?? "");
  // Proactive autocompact, as the pod runs it before every prompt: only a
  // session that resumed its native history has anything to compact.
  const resumedHistory =
    !opened.freshSession &&
    (harness === "pi" ||
      (opened.claudeResume !== undefined && !opened.armedSummary));
  const autocompaction = resumedHistory
    ? await autocompactPooledSession({
        session,
        model,
        dataDir: directories.dataDir,
        conversationId,
        canonical: input.canonicalMessages,
        transcriptFill: harness === "claude",
        ...(turn.signal ? { signal: turn.signal } : {}),
        harvest: {
          call: turn.sandbox?.call ?? null,
          workspaceDir: directories.workspaceDir,
        },
      })
    : undefined;
  return {
    replay,
    session,
    backendId: opened.backend.id,
    model,
    modelRuntime,
    compaction: routineReset?.compaction ?? autocompaction,
    // What the reset's replay put in the fresh session, for the run's
    // recorded carry (turn-routine-context.ts).
    routineResetBase: routineReset
      ? estimateTokens(replay?.text ?? "")
      : undefined,
  };
}
