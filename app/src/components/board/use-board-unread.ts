import { useMemo } from "react";
import { useConversations } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useReadCursorStore } from "../../hooks/use-read-cursors";
import { useSession } from "../../hooks/use-session";
import { isMultiplayer } from "../../lib/org-roles";
import {
  type UnreadConversationInput,
  unreadMissionIds,
} from "../../lib/unread-model";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Which of these missions have something new FOR ME (HOU-945) — the per-card
 * half of the sidebar's unread badge, reusing the SAME pure model
 * ({@link unreadMissionIds}) and the SAME live cursor store, so a lit card and a
 * lit agent row can never tell the user different things.
 *
 * Multiplayer-gated twice over, on purpose. The capability gate keeps
 * single player / desktop on the empty set (no cursor read reaches the cards at
 * all), and the model itself returns nothing without a `selfId` — an unread
 * badge is per-person reading state, and with nobody signed in it would be a
 * mark no one could ever clear.
 *
 * The cursor store is an EXTERNAL store, not a query, so reading it here adds
 * no query observer and can never trigger a fetch (in hosted mode a stray fetch
 * is the thing that WAKES a sleeping pod).
 */
export function useBoardUnread(
  convos: readonly UnreadConversationInput[] | undefined,
): ReadonlySet<string> {
  const { capabilities } = useCapabilities();
  const multiplayer = isMultiplayer(capabilities);
  const cursors = useReadCursorStore();
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;

  return useMemo(
    () =>
      multiplayer && convos ? unreadMissionIds(convos, cursors, selfId) : EMPTY,
    [multiplayer, convos, cursors, selfId],
  );
}

/**
 * The same verdict for ONE agent's board. Mirrors {@link useAgentBoardPeople}:
 * the board's own rows come from the activity list, which carries no
 * attribution and no mention aggregate, so the conversations query is what can
 * answer "is this mine, and has anyone typed my name here". React Query dedupes
 * it with the attribution hook's identical read, so this costs no extra request
 * — and off multiplayer it is never enabled at all.
 */
export function useAgentBoardUnread(agentPath: string): ReadonlySet<string> {
  const { capabilities } = useCapabilities();
  const { data: convos } = useConversations(
    isMultiplayer(capabilities) ? agentPath : undefined,
  );
  return useBoardUnread(convos);
}
