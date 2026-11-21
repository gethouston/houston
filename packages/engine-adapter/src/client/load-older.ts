import type { HoustonEngineClient } from "@houston/runtime-client";
import {
  conversationScope,
  type HistoryWindowVM,
  historyToFeed as sdkHistoryToFeed,
} from "@houston/sdk";
import { CHAT_OLDER_PAGE } from "../history-window";
import { conversationStore, conversationVm } from "../vm";

const inFlight = new Set<string>();

function historyWindowOf(scope: string): HistoryWindowVM | undefined {
  const snap = conversationStore.getSnapshot(scope) as
    | { historyWindow?: HistoryWindowVM }
    | undefined;
  return snap?.historyWindow;
}

export async function loadOlderPage(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
): Promise<{ hasOlder: boolean }> {
  const scope = conversationScope(agentPath, sessionKey);
  const win = historyWindowOf(scope);
  if (!win || win.earliestLoaded <= 0) return { hasOlder: false };
  if (inFlight.has(scope)) return { hasOlder: true };
  inFlight.add(scope);
  try {
    const history = await engine.getHistory(sessionKey, {
      limit: CHAT_OLDER_PAGE,
      before: win.earliestLoaded,
    });
    const offset = history.offset ?? 0;
    const messages =
      offset === 0 && history.messages.length > win.earliestLoaded
        ? history.messages.slice(0, win.earliestLoaded)
        : history.messages;
    const nowWin = historyWindowOf(scope);
    if (nowWin?.earliestLoaded !== win.earliestLoaded) {
      return { hasOlder: (nowWin?.earliestLoaded ?? 0) > 0 };
    }
    if (messages.length === 0) return { hasOlder: false };
    conversationVm.prependHistory(
      agentPath,
      sessionKey,
      sdkHistoryToFeed(messages),
      {
        earliestLoaded: offset,
        total: history.totalMessages ?? history.messages.length,
      },
    );
    return { hasOlder: offset > 0 };
  } finally {
    inFlight.delete(scope);
  }
}
