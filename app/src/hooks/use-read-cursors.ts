import { useEffect, useSyncExternalStore } from "react";
import { conversationIdForChat } from "../lib/chat-conversation-id";
import { logger } from "../lib/logger";
import { queryClient } from "../lib/query-client";
import {
  getReadCursorStore,
  markConversationRead,
  subscribeToReadCursors,
} from "../lib/read-cursor-live-store";
import type { ReadCursorStore } from "../lib/read-cursors";

/**
 * The React bindings for the app's live read-cursor store (HOU-945): one hook
 * to READ it and one to FEED it.
 *
 * Everything stateful lives in `lib/read-cursor-live-store.ts`, which is
 * React-free so a notification callback running with no component mounted reads
 * the very same store the shell paints. This module adds only the two things
 * that genuinely need React: the external-store subscription, and the effect
 * that mounts the "conversation viewed" observer.
 */

/** The live cursor store for the signed-in user (a fresh empty store when
 *  signed out). Re-renders the caller whenever a cursor moves. */
export function useReadCursorStore(): ReadCursorStore {
  return useSyncExternalStore(
    subscribeToReadCursors,
    getReadCursorStore,
    getReadCursorStore,
  );
}

/**
 * Cache events that mean "this conversation is being read RIGHT NOW": it was
 * just put on screen (`observerAdded`), or fresh content landed in it
 * (`updated` — a refetch after the `ConversationsChanged` invalidation, i.e. a
 * teammate's turn repainting the open chat).
 *
 * Everything else is deliberately ignored, and the exclusion is load-bearing
 * rather than an optimization: `observerOptionsUpdated` fires on EVERY RENDER of
 * every component holding the query (React Query hands the observer a fresh
 * options object each time). Marking on those made the tracker a render-driven
 * write — each one stamps a NEW `Date.now()`, so the cursor store changed on
 * every render and notified its subscribers. That was invisible while only the
 * sidebar read the store (it observes no chat history, so the cascade stopped),
 * and became an infinite update loop the moment a SECOND surface subscribed:
 * store change → board re-render → options updated → new cursor → store change.
 */
const VIEWED_EVENTS = new Set(["observerAdded", "updated"]);

/**
 * Mounts the "conversation viewed" tracker. Call once, at the top of the app.
 *
 * The seam is the `["chat-history", agentPath, sessionKey]` query that EVERY
 * surface opening a chat mounts, observed raw so no surface has to remember to
 * report anything. `getObserversCount() > 0` is what makes it mean "open on
 * screen" rather than "still in cache". It re-marks on every VIEWED event (see
 * {@link VIEWED_EVENTS}), not just the first, so a conversation the user is
 * watching while it streams cannot go stale-unread under them.
 */
export function useReadCursorTracker(): void {
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (!VIEWED_EVENTS.has(event.type)) return;
      const [head, agentPath, sessionKey] = event.query.queryKey;
      if (head !== "chat-history") return;
      if (typeof agentPath !== "string" || agentPath === "") return;
      if (typeof sessionKey !== "string" || sessionKey === "") return;
      if (event.query.getObserversCount() <= 0) return;
      try {
        // Null means the caches cannot yet name this chat's mission. Writing a
        // cursor anyway would key it by something no reader ever looks up (see
        // `chat-conversation-id.ts`); the events above re-fire once the lists
        // land, and THAT pass marks the real key.
        const conversationId = conversationIdForChat(agentPath, sessionKey);
        if (conversationId === null) return;
        markConversationRead(agentPath, conversationId);
      } catch (e) {
        // Log-only, the documented exception: this is a passive cache observer
        // with no UI thread to toast on, and the worst outcome is a badge that
        // stays lit until the next open. Never let it break the query cache's
        // notification loop for every other subscriber.
        logger.error(`[read-cursors] failed to mark conversation read: ${e}`);
      }
    });
  }, []);
}
