import { DEFAULT_TURN_MODE } from "@houston/protocol";
import { resolveModel } from "../ai/providers";
import { config } from "../config";
import { LruCache } from "../lru";
import { claudeSessionTokenStale } from "./claude-token-guard";
import { serverBackendFor } from "./conversation-backends";
import { type Conversation, isConvBusy } from "./conversation-record";
import type { TurnPin } from "./exec-turn";
import { openConversationSession } from "./open-conversation-session";
import type { ProvidedContext } from "./workspace-context";

export type { Conversation } from "./conversation-record";
export {
  switchBackendIfNeeded,
  switchModeIfNeeded,
} from "./conversation-switch";

export const conversations = new LruCache<string, Conversation>({
  capacity: config.sessionCacheMax,
  idleMs: config.sessionCacheIdleMs > 0 ? config.sessionCacheIdleMs : undefined,
  isPinned: (_id, conv) => isConvBusy(conv),
  onEvict: (_id, conv) => conv.session.dispose(),
});

const IDLE_SWEEP_INTERVAL_MS = 60_000;
if (config.sessionCacheIdleMs > 0) {
  setInterval(
    () => conversations.sweepIdle(),
    Math.min(IDLE_SWEEP_INTERVAL_MS, config.sessionCacheIdleMs),
  ).unref();
}

export async function getConversation(
  id: string,
  pin?: TurnPin,
  context?: ProvidedContext,
): Promise<Conversation> {
  const existing = conversations.get(id);
  const rotatedOut =
    existing && !isConvBusy(existing) && claudeSessionTokenStale(existing);
  if (existing && !rotatedOut) {
    conversations.sweepIdle();
    return existing;
  }
  const carriedContext = context ?? existing?.context;
  if (existing) {
    conversations.delete(id);
    existing.session.dispose();
  }

  const builtModel = resolveModel(pin?.model, pin?.provider);
  const backend = serverBackendFor(builtModel.provider);
  const mode = pin?.mode ?? DEFAULT_TURN_MODE;
  const session = await openConversationSession(backend, {
    conversationId: id,
    model: builtModel,
    mode,
    nextStepSuggestions: pin?.nextStepSuggestions,
    timezone: pin?.timezone,
    ...(carriedContext ? { context: carriedContext } : {}),
  });

  const conv: Conversation = {
    session,
    queue: Promise.resolve(),
    provider: builtModel.provider,
    model: builtModel.id,
    backendId: backend.id,
    mode,
    nextStepSuggestions: pin?.nextStepSuggestions,
    timezone: pin?.timezone,
    pending: 0,
    ...(carriedContext ? { context: carriedContext } : {}),
  };
  conversations.set(id, conv);
  conversations.sweepIdle();
  return conv;
}
