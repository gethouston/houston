import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import { logTurnTarget } from "../ai/turn-diagnostic";
import { readAuthFile } from "../auth/auth-file";
import type { newUsedTokenCapture } from "../auth/used-token";
import {
  type ClaudeResume,
  createSessionsStore,
} from "../backends/claude/sessions-store";
import { hasUnreadablePiSessionTail } from "../backends/pi/session-files";
import { recordedContextFill } from "../session/recorded-context-fill";
import { replayForConversation } from "../session/routine-replay";
import { autocompactPooledSession } from "./turn-autocompact";
import { turnClaudeLayout } from "./turn-backend";
import { seedTurnClaudeFlags } from "./turn-claude-flags";
import { settleClaudeSummary } from "./turn-compactions";
import { readTurnHarness, writeTurnHarness } from "./turn-harness-state";
import {
  loadRoutineReplayArchive,
  resetPooledRoutineSession,
  routineReplayHistory,
} from "./turn-routine-context";
import {
  finishTurnSessionStartup,
  type RunTurnDeps,
  startTurnSession,
} from "./turn-session-startup";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session-types";

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
  const routineFire = resetPooledRoutineSession({
    dataDir: directories.dataDir,
    conversationId,
    fire: turn.routineFire === true,
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
  const freshSession = switchedHarness || unreadablePiResume || routineFire;
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
  await loadRoutineReplayArchive(directories.loadArchive, conversationId);
  const replayOf = () =>
    replayForConversation({
      conversationId,
      messages: routineReplayHistory(
        directories.dataDir,
        conversationId,
        input.canonicalMessages,
      ),
      currentTurnId: turnId,
      dirs: { ...directories, assistantRole: turn.role ?? null },
      windowTokens: model.contextWindow,
    });
  const replay =
    freshSession || (harness === "claude" && !claudeResume && !armedSummary)
      ? replayOf()
      : null;
  const retryReplay = () => (replay ?? replayOf())?.text ?? "";
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
    nextStepSuggestions: turn.nextStepSuggestions,
    timezone: turn.timezone,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(turn.context ? { context: turn.context } : {}),
    ...(turn.mode ? { mode: turn.mode } : {}),
    ...(freshSession ? { fresh: true } : {}),
    ...(harness === "claude" ? { freshRetryPromptPrefix: retryReplay } : {}),
    recordedContextTokens: () => recordedContextFill(input.canonicalMessages),
  });
  if (turn.timings) turn.timings.t_backend_session = performance.now();
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
        clearedTokens: claudeResume?.clearedTokens,
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
    compaction: autocompaction,
  };
}

function resolveTurnClaudeResume(
  directories: TurnDirectories,
  conversationId: string,
): ClaudeResume | undefined {
  const layout = turnClaudeLayout(
    directories.turnRoot,
    directories.dataDir,
    conversationId,
  );
  return createSessionsStore({
    configDir: layout.configDir,
    sessionsFile: layout.sessionsFile,
    cwd: directories.workspaceDir,
  }).resolveResume(conversationId);
}
