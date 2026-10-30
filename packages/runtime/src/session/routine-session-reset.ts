import type { TurnMode } from "@houston/protocol";
import type { ResolvedModel } from "../backends/types";
import { config } from "../config";
import { getHistory } from "../store/conversations";
import { serverBackendFor } from "./conversation-backends";
import type { Conversation } from "./conversation-record";
import { clearNativeSessionState } from "./native-session-state";
import { openConversationSession } from "./open-conversation-session";
import type { ReplayPreamble } from "./replay-transcript";
import { isRoutineConversation, type RoutineTurnKind } from "./routine-context";
import { ROUTINE_REPLAY_TAIL, routineReplay } from "./routine-replay";

/** A routine turn that starts on a fresh session, and what it carries in. */
export interface RoutineSessionReset {
  /** The digest prepended to this turn's prompt; null with nothing earlier. */
  replay: ReplayPreamble | null;
}

/**
 * The standing server's half of the routine context rule (routine-context.ts):
 * a routine FIRE drops the conversation's backend-native context and rebuilds
 * its session fresh, BEFORE the turn's backend and mode switches — the
 * rebuild lands on the resolved model's backend in the turn's mode, so both
 * switches then no-op. A person's turn is left alone (returns null) unless an
 * earlier rebuild failed half way.
 */
export async function resetRoutineSessionIfNeeded(
  conv: Conversation,
  conversationId: string,
  turnId: string,
  model: ResolvedModel,
  mode: TurnMode,
  kind: RoutineTurnKind,
): Promise<RoutineSessionReset | null> {
  if (!isRoutineConversation(conversationId)) return null;
  if (kind !== "fire" && !conv.sessionRebuildPending) return null;
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
    nextStepSuggestions: conv.nextStepSuggestions,
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
  return {
    replay: routineReplay(
      config,
      conversationId,
      getHistory(conversationId, { limit: ROUTINE_REPLAY_TAIL })?.messages ??
        [],
      turnId,
    ),
  };
}
