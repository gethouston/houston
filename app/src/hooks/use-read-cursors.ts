import { useEffect } from "react";
import { conversationIdForChat } from "../lib/chat-conversation-id";
import { logger } from "../lib/logger";
import { queryClient } from "../lib/query-client";
import { markConversationRead } from "../lib/read-cursor-live-store";

const VIEWED_EVENTS = new Set(["observerAdded", "updated"]);

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
        const conversationId = conversationIdForChat(agentPath, sessionKey);
        if (conversationId === null) return;
        markConversationRead(agentPath, conversationId);
      } catch (e) {
        logger.error(`[read-cursors] failed to mark conversation read: ${e}`);
      }
    });
  }, []);
}
