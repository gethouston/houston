import { effectiveModelWindow } from "@houston/protocol/model-windows";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import type { HarnessSession } from "../backends/types";
import { resolveTurnClaudeResume, turnClaudeLayout } from "./turn-backend";
import { seedTurnClaudeFlags } from "./turn-claude-flags";
import { settleClaudeSummary } from "./turn-compactions";
import { readTurnHarness, writeTurnHarness } from "./turn-harness-state";
import {
  type PooledRoutineReset,
  resetPooledRoutineContext,
} from "./turn-routine-context";
import type { TurnSessionStartup } from "./turn-session-startup";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session-types";

/** A turn's harness session, opened from the hydrated tree, not yet prompted. */
export interface OpenedTurnHarness extends TurnSessionStartup {
  session: HarnessSession;
  harness: "claude" | "pi";
  /** The session starts without its native history (it gets a replay). */
  freshSession: boolean;
  claudeResume: string | undefined;
  /** A Claude summary is armed and is this turn's history instead. */
  armedSummary: boolean;
  routineReset: PooledRoutineReset | null;
  /** The model's catalog window, the replay's and the reset's budget. */
  catalogWindow: number;
  /** Name the replay a refused Claude resume retries with (built later). */
  setRetryReplay(replay: () => string): void;
}

/**
 * Decide how the conversation's harness session starts (resumed, fresh, on
 * an armed summary), prepare its directory for that, and open it. Reads only
 * the hydrated tree and the request, never the transcript row this turn
 * appends, so it may run before or after that row lands.
 * `piResumeUnreadable` is asked only when the harness is pi.
 */
export async function openTurnHarness(input: {
  directories: TurnDirectories;
  turn: TurnSessionRequest;
  startup: TurnSessionStartup;
  piResumeUnreadable: () => boolean;
}): Promise<OpenedTurnHarness> {
  const { turn, directories, startup } = input;
  const { backend, model } = startup;
  const { provider, pin, conversationId, turnId } = turn;
  const reasoning = (model as unknown as { reasoning?: boolean }).reasoning;
  const effort =
    pin?.effort ?? (reasoning === true ? DEFAULT_REASONING_EFFORT : undefined);
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
  });
  const harness = backend.id === "anthropic" ? "claude" : "pi";
  const priorHarness = readTurnHarness(directories.dataDir, conversationId);
  const switchedHarness =
    priorHarness !== undefined && priorHarness !== harness;
  const unreadablePiResume = harness === "pi" && input.piResumeUnreadable();
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
  let retryReplay: (() => string) | undefined;
  const session = await backend.createSession({
    conversationId,
    model,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(turn.context ? { context: turn.context } : {}),
    ...(turn.mode ? { mode: turn.mode } : {}),
    ...(freshSession ? { fresh: true } : {}),
    // Claude's fallback when the SDK refuses its resume: deferred until then.
    ...(harness === "claude"
      ? { freshRetryPromptPrefix: () => retryReplay?.() ?? "" }
      : {}),
  });
  if (turn.timings) turn.timings.t_backend_session = performance.now();
  return {
    ...startup,
    session,
    harness,
    freshSession,
    claudeResume,
    armedSummary,
    routineReset,
    catalogWindow,
    setRetryReplay(replay) {
      retryReplay = replay;
    },
  };
}
