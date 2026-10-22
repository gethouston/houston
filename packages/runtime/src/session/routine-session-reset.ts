import type { TurnMode } from "@houston/protocol";
import { effectiveModelWindow } from "@houston/protocol/model-windows";
import type { ResolvedModel } from "../backends/types";
import { config } from "../config";
import {
  getHistory,
  getRoutineTranscript,
  setRoutineCarry,
} from "../store/conversations";
import { serverBackendFor } from "./conversation-backends";
import type { Conversation } from "./conversation-record";
import { clearNativeSessionState } from "./native-session-state";
import { openConversationSession } from "./open-conversation-session";
import type { ReplayPreamble } from "./replay-transcript";
import { carryAfterRun } from "./routine-carry";
import {
  isRoutineConversation,
  planRoutineContext,
  type RoutineTurnKind,
} from "./routine-context";
import {
  ROUTINE_REPLAY_TAIL,
  renderRoutineReplay,
  routineReplayTokenBudget,
} from "./routine-replay";
import { estimateTokens } from "./token-estimate";

/** A routine run that starts on a fresh session, and what it carries in. */
export interface RoutineSessionReset {
  /** The context the previous run ended on, for the boundary's `pre_tokens`. */
  preTokens: number | null;
  /** The bounded transcript prepended to this run's prompt. */
  replay: ReplayPreamble | null;
  /** What that replay puts in the fresh session, for the run's recorded carry. */
  baseTokens: number;
}

/**
 * The standing server's half of the routine context budget (routine-context.ts):
 * when the plan calls for it, drop the conversation's backend-native context
 * and rebuild its session fresh, BEFORE the turn's backend and mode switches —
 * the rebuild lands on the resolved model's backend in the turn's mode, so
 * both switches then no-op. Returns null (and touches nothing) otherwise.
 *
 * Decides from the chat's live transcript file plus the carry its last run
 * recorded (routine-carry.ts), the same view a pooled worker decides from.
 * Only a reset reads further back, for the replay's tail.
 */
export async function resetRoutineSessionIfNeeded(
  conv: Conversation,
  conversationId: string,
  turnId: string,
  prompt: string,
  model: ResolvedModel,
  mode: TurnMode,
  kind: RoutineTurnKind,
): Promise<RoutineSessionReset | null> {
  // Checked before the history read: every other turn skips parsing the file.
  if (!isRoutineConversation(conversationId)) return null;
  const transcript = getRoutineTranscript(conversationId);
  const window = effectiveModelWindow(
    model.provider,
    model.id,
    model.contextWindow,
    0,
  );
  const plan = planRoutineContext(
    conversationId,
    transcript,
    turnId,
    window,
    kind,
  );
  if (!plan.reset && !conv.sessionRebuildPending) return null;
  console.info(
    plan.reset
      ? `[routine] ${conversationId}: previous run ended on ${plan.carriedTokens ?? "an overflow of"} tokens (window ${plan.windowTokens}); starting a fresh session with a bounded replay`
      : `[routine] ${conversationId}: retrying the fresh session an earlier reset could not build`,
  );
  // Flagged BEFORE the dispose: if the rebuild throws, this record stays the
  // one queue owner and its next turn retries instead of prompting the
  // disposed session (the throw becomes this turn's error).
  conv.sessionRebuildPending = true;
  conv.session.dispose();
  clearNativeSessionState(config.dataDir, conversationId);
  const backend = serverBackendFor(model.provider);
  conv.session = await openConversationSession(backend, {
    conversationId,
    model,
    mode,
    fresh: true,
    ...(conv.context ? { context: conv.context } : {}),
  });
  conv.sessionRebuildPending = undefined;
  conv.backendId = backend.id;
  conv.provider = model.provider;
  conv.model = model.id;
  conv.mode = mode;
  // The tail may sit in an archive segment: a rotation can move the whole
  // previous run out of the live file, and it is the run to remember.
  const replay = renderRoutineReplay(
    getHistory(conversationId, { limit: ROUTINE_REPLAY_TAIL })?.messages ?? [],
    turnId,
    prompt,
    routineReplayTokenBudget(plan.reset ? plan.windowTokens : window),
  );
  return {
    preTokens: plan.reset ? plan.carriedTokens : null,
    replay,
    baseTokens: estimateTokens(replay?.text ?? ""),
  };
}

/**
 * Record what a finished run of a routine chat left its session holding
 * (routine-carry.ts), so the next run decides from it whatever a rotation
 * archives in between. Run for every turn of a routine chat, clean or not;
 * never throws, since the turn itself is already over.
 */
export function recordRoutineCarry(
  conversationId: string,
  turnId: string,
  reset: RoutineSessionReset | null,
): void {
  if (!isRoutineConversation(conversationId)) return;
  try {
    setRoutineCarry(
      conversationId,
      carryAfterRun(
        getRoutineTranscript(conversationId),
        turnId,
        reset?.baseTokens,
      ),
    );
  } catch (error) {
    // Reported, not fatal: without the record the next run falls back to the
    // transcript, and resets when rotation hid what it would measure.
    console.error(
      `[routine] ${conversationId}: could not record the run's context carry:`,
      error,
    );
  }
}
