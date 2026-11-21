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

export interface RoutineSessionReset {
  replay: ReplayPreamble | null;
}

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
  conv.sessionRebuildPending = true;
  conv.session.dispose();
  clearNativeSessionState(config.dataDir, conversationId);
  const backend = serverBackendFor(model.provider);
  conv.session = await openConversationSession(backend, {
    conversationId,
    model,
    mode,
    nextStepSuggestions: conv.nextStepSuggestions,
    timezone: conv.timezone,
    fresh: true,
    ...(conv.context ? { context: conv.context } : {}),
  });
  conv.sessionRebuildPending = undefined;
  conv.backendId = backend.id;
  conv.provider = model.provider;
  conv.model = model.id;
  conv.mode = mode;
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
