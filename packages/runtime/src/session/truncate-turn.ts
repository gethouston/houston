import { truncateConversation } from "../store/conversations";
import { evict, isTurnRunning } from "./bus";
import { disposeConversation } from "./chat";
import { conversations } from "./conversation-cache";

/**
 * The edit-and-resend rewind (PRODUCT-1217): cut a conversation at a user
 * turn so the client can resend an edited version of that message. The
 * transcript keeps everything BEFORE the turn; the turn's user message and
 * everything after it are dropped.
 *
 * The canonical transcript is NOT what the model reads (its context lives in
 * the backend-native session store), so a cut must invalidate that too — the
 * same teardown DELETE /conversations/:id runs, minus deleting the file:
 * dispose the live session, delete both backends' native session state, and
 * evict the event channel so a connected client resyncs against the truncated
 * history. The store write stamped `needsSessionReplay`, so the NEXT turn
 * rebuilds a fresh session and carries the kept messages in as a replay
 * preamble (HOU-951) — without that the model would either still remember the
 * dropped turns (stale native session) or forget the kept ones (empty fresh
 * session).
 */
export type TruncateTurnResult = "busy" | "not_found" | { removed: number };

export async function truncateConversationTurn(
  id: string,
  turnId: string,
): Promise<TruncateTurnResult> {
  // Same posture as dismiss-interaction: never rewrite history behind an
  // executing turn — and not behind a QUEUED one either (`pending` covers a
  // turn parked on the workdir lock whose session teardown below would
  // otherwise yank its session mid-wait). The client disables the edit
  // affordance while running, so a 409 here means the user raced a turn.
  if (isTurnRunning(id) || (conversations.get(id)?.pending ?? 0) > 0)
    return "busy";
  const cut = truncateConversation(id, turnId);
  if (!cut) return "not_found";
  await disposeConversation(id, { deleteSessions: true });
  // Outstanding SSE resume cursors point into the pre-cut feed — unserviceable
  // by definition, so drop the channel; reconnects get `sync {resync}` and
  // refetch the truncated history.
  evict(id);
  return cut;
}
