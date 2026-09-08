import { DEFAULT_TURN_MODE } from "@houston/protocol";
import { resolveModel } from "../ai/providers";
import { backendFor } from "../backends/registry";
import { config } from "../config";
import { LruCache } from "../lru";
import { claudeSessionTokenStale } from "./claude-token-guard";
// Imported for its module-level side effects: the process's harness backend
// registrations (pi as the default, Claude for `anthropic`) must be in place
// before this cache opens a session through `backendFor`.
import "./conversation-backends";
import { type Conversation, isConvBusy } from "./conversation-record";
import type { TurnPin } from "./exec-turn";
import type { ProvidedContext } from "./workspace-context";

export type { Conversation } from "./conversation-record";
export {
  switchBackendIfNeeded,
  switchModeIfNeeded,
} from "./conversation-switch";

/**
 * The long-lived server's per-conversation session cache: the backends built
 * from this runtime's tool surface (session-tools.ts), the Conversation record
 * (session + turn queue + the tracked provider/model + the executing turn's
 * id), and the lazy build/rehydrate. Turn execution runs the session behind the
 * HarnessBackend seam (backends/) — pi is the default backend. Turn logic lives
 * in exec-turn.ts; the public turn API (run/cancel/dispose) in chat.ts.
 */

/**
 * This module is the cache itself — the LRU and the lazy build/rehydrate — and
 * the front door everything else imports. The Conversation record and its busy
 * predicate live in `conversation-record.ts`, the backend registrations in
 * `conversation-backends.ts`, and the mid-conversation backend/mode rebuilds in
 * `conversation-switch.ts` — the record and the switches re-exported here.
 */

/**
 * Live sessions by conversation id (module state — one workspace per process),
 * LRU-bounded + idle-expiring so a long-lived runtime's memory tracks its ACTIVE
 * conversations, not every one ever opened. An evicted session is disposed and
 * transparently re-hydrated from its on-disk transcript on next access — behavior
 * is preserved; only idle, turn-free sessions are ever evicted (see isConvBusy).
 */
export const conversations = new LruCache<string, Conversation>({
  capacity: config.sessionCacheMax,
  idleMs: config.sessionCacheIdleMs > 0 ? config.sessionCacheIdleMs : undefined,
  isPinned: (_id, conv) => isConvBusy(conv),
  onEvict: (_id, conv) => conv.session.dispose(),
});

export async function getConversation(
  id: string,
  pin?: TurnPin,
  context?: ProvidedContext,
): Promise<Conversation> {
  const existing = conversations.get(id);
  // PRODUCT-1355 (layer 2): a cached Claude session pinned to an access token
  // the store no longer holds (the gateway rotated the family; Anthropic
  // invalidated the superseded token) is disposed and rebuilt below, so the
  // fresh session reads the current credential. Busy conversations are left
  // alone — their queued turns hold this very object, and the per-prompt
  // credential re-read keeps them correct; matching digests, digest-less
  // sessions, and non-Claude backends fall through untouched (no churn).
  const rotatedOut =
    existing && !isConvBusy(existing) && claudeSessionTokenStale(existing);
  if (existing && !rotatedOut) {
    // Reap sessions idle past the TTL on every access, so a quiet runtime still
    // sheds memory between turns (get() above already marked `existing` fresh).
    conversations.sweepIdle();
    return existing;
  }
  // Preserve the conversation's startup context across the rebuild (HOU-711),
  // exactly like the backend/mode rebuilds below do.
  const carriedContext = context ?? existing?.context;
  if (existing) {
    conversations.delete(id);
    existing.session.dispose();
  }

  // The model the session is built with — recorded on the Conversation so a
  // later turn can detect when the active provider/model changed under it.
  // A routine's pin builds the session directly on ITS provider/model, so a
  // pinned routine works even when the agent's saved provider is logged out.
  const builtModel = resolveModel(pin?.model, pin?.provider);
  // Resolve the provider's backend (pi by default) and open the conversation's
  // session through it. The backend rehydrates prior turns from disk when the
  // conversation already exists — see createPiBackend.
  const backend = backendFor(builtModel.provider);
  // The first turn's mode fixes how the session is built (read-only + planning
  // overlay for "plan"). A later flip rebuilds via `switchModeIfNeeded`.
  const mode = pin?.mode ?? DEFAULT_TURN_MODE;
  const session = await backend.createSession({
    conversationId: id,
    model: builtModel,
    mode,
    // Only used when the session is FIRST built (new conversation) — a later
    // message in the same conversation reuses this session, so context edits
    // take effect on the next chat, matching the local file behavior (HOU-711).
    ...(carriedContext ? { context: carriedContext } : {}),
  });

  const conv: Conversation = {
    session,
    queue: Promise.resolve(),
    provider: builtModel.provider,
    model: builtModel.id,
    backendId: backend.id,
    mode,
    pending: 0,
    ...(carriedContext ? { context: carriedContext } : {}),
  };
  // set() enforces the size bound (disposing the LRU tail if full); sweepIdle()
  // then reaps any TTL-expired idle session. Both skip busy sessions, and the
  // just-built `conv` is the most-recent entry, so it is never the one evicted.
  conversations.set(id, conv);
  conversations.sweepIdle();
  return conv;
}
