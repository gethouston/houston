import type { HoustonEngineClient } from "@houston/runtime-client";
import {
  conversationScope,
  type HistoryWindowVM,
  historyToFeed as sdkHistoryToFeed,
} from "@houston/sdk";
import { CHAT_OLDER_PAGE } from "../history-window";
import { conversationStore, conversationVm } from "../vm";

/** Per-conversation single-flight guard for scroll-up load-older reads. */
const inFlight = new Set<string>();

/** The conversation's stamped server window, or undefined (no windowed read yet). */
function historyWindowOf(scope: string): HistoryWindowVM | undefined {
  const snap = conversationStore.getSnapshot(scope) as
    | { historyWindow?: HistoryWindowVM }
    | undefined;
  return snap?.historyWindow;
}

/**
 * Prepend the previous transcript page before the loaded window — the
 * scroll-up lazy-load (HOU-819). Reads the conversation's `historyWindow`
 * off the VM (stamped by the windowed open read), fetches the
 * {@link CHAT_OLDER_PAGE} messages ending at `earliestLoaded`, and prepends
 * their fold. Single-flight per conversation; a reseed racing the fetch (a
 * fresh tail replacing the feed mid-load) drops the fetched page rather than
 * prepending it against the wrong window.
 */
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
    // A pre-windowing server (or a proxy that dropped the params) returns
    // the FULL transcript — cut it to the part below our cursor.
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
