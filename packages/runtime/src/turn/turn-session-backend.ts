import { join } from "node:path";
import { effectiveModelWindow } from "@houston/protocol/model-windows";
import type { ChatMessage } from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import { logTurnTarget } from "../ai/turn-diagnostic";
import { readAuthFile } from "../auth/auth-file";
import type { newUsedTokenCapture } from "../auth/used-token";
import { hasUnreadablePiSessionTail } from "../backends/pi/session-files";
import { recordedContextFill } from "../session/recorded-context-fill";
import { replayCharBudget } from "../session/replay-transcript";
import { replayForConversation } from "../session/routine-replay";
import { estimateTokens } from "../session/token-estimate";
import { autocompactPooledSession } from "./turn-autocompact";
import { resolveTurnClaudeResume, turnClaudeLayout } from "./turn-backend";
import { seedTurnClaudeFlags } from "./turn-claude-flags";
import { settleClaudeSummary } from "./turn-compactions";
import { readTurnHarness, writeTurnHarness } from "./turn-harness-state";
import {
  loadRoutineReplayArchive,
  resetPooledRoutineContext,
  routineReplayHistory,
} from "./turn-routine-context";
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
  const { backend, model, modelRuntime } = await finishTurnSessionStartup(
    turn.startup ?? startTurnSession(directories, turn, input.deps),
  );
  const turnCred = readAuthFile(join(directories.dataDir, "auth.json"))[
    provider
  ];
  if (turnCred?.type === "oauth" && turnCred.access)
    input.usedTokens.record(provider, turnCred.access);
  const diagnostic = model as unknown as {
    id?: string;
    baseUrl?: string;
    reasoning?: boolean;
  };
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
  const effort =
    pin?.effort ??
    (diagnostic.reasoning === true ? DEFAULT_REASONING_EFFORT : undefined);
  const thinkingLevel = toThinkingLevel(effort);
  // The routine context budget, before anything reads or writes the session
  // dir it may delete (turn-routine-context.ts).
  const catalogWindow = effectiveModelWindow(
    provider,
    model.id,
    model.contextWindow,
    0,
  );
  const routineReset = resetPooledRoutineContext({
    dataDir: directories.dataDir,
    conversationId,
    turnId,
    windowTokens: catalogWindow,
    kind: turn.routineFire ? "fire" : "chat",
  });
  const harness = backend.id === "anthropic" ? "claude" : "pi";
  const priorHarness = readTurnHarness(directories.dataDir, conversationId);
  const switchedHarness =
    priorHarness !== undefined && priorHarness !== harness;
  const unreadablePiResume =
    harness === "pi" &&
    input.canonicalMessages.length > 0 &&
    hasUnreadablePiSessionTail(
      join(directories.dataDir, "sessions", conversationId),
    );
  const freshSession =
    switchedHarness || unreadablePiResume || routineReset !== null;
  writeTurnHarness(directories.dataDir, conversationId, harness);
  const armedSummary = settleClaudeSummary(
    directories.dataDir,
    conversationId,
    { harness, freshSession },
  );
  const claudeResume =
    harness === "claude" && !switchedHarness
      ? resolveTurnClaudeResume(directories, conversationId)
      : undefined;
  // A routine chat replays the same archive-aware tail the standing server
  // reads, bounded by the routine budget; every other chat keeps its hydrated
  // live file and the budget it always had here (routine-replay.ts). Built
  // only when a session actually starts without its history: the tail can
  // reach into archive segments, which a resumed run must never parse. Any
  // the tail reaches that stayed remote land first (only stats when none).
  await loadRoutineReplayArchive(directories.loadArchive, conversationId);
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
      windowTokens: routineReset?.windowTokens ?? catalogWindow,
      charBudget: replayCharBudget(model.contextWindow),
    });
  // An armed Claude summary IS the history the new session starts from.
  const replay =
    freshSession || (harness === "claude" && !claudeResume && !armedSummary)
      ? replayOf()
      : null;
  // Claude's fallback when the SDK refuses its resume: deferred until then.
  const retryReplay = () => (replay ?? replayOf())?.text ?? "";
  // The CLI blocks its first start on a flag fetch unless its config dir
  // already holds the flags: hand it the acting member's stored copy.
  if (harness === "claude")
    seedTurnClaudeFlags({
      dataDir: directories.dataDir,
      configDir: turnClaudeLayout(
        directories.turnRoot,
        directories.dataDir,
        conversationId,
      ).configDir,
      userId: turn.author?.userId,
    });
  const session = await backend.createSession({
    conversationId,
    model,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(turn.context ? { context: turn.context } : {}),
    ...(turn.mode ? { mode: turn.mode } : {}),
    ...(freshSession ? { fresh: true } : {}),
    ...(harness === "claude" ? { freshRetryPromptPrefix: retryReplay } : {}),
    recordedContextTokens: () => recordedContextFill(input.canonicalMessages),
  });
  if (turn.timings) turn.timings.t_backend_session = performance.now();
  // Proactive autocompact, as the pod runs it before every prompt: only a
  // session that resumed its native history has anything to compact.
  const resumedHistory =
    !freshSession &&
    (harness === "pi" || (claudeResume !== undefined && !armedSummary));
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
    backendId: backend.id,
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
