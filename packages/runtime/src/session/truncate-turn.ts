import { truncateConversation } from "../store/conversations";
import { evict } from "./bus";
import { disposeConversation } from "./chat";
import {
  beginConversationCommand,
  conversationCommandBusy,
} from "./conversation-command-gate";

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
  // A rewind IS a conversation command: it rewrites the context later turns
  // read, so it rides the same acceptance gate `/clear` and `/compact` do
  // (conversation-command-gate.ts) rather than a private copy of half of it.
  // The private copy checked only the executing and queued turns, which left
  // the window this closes: a turn ACCEPTED by the route but not yet queued
  // (credential sync, session build) would have its session torn out from
  // under it, and a `/clear` already working the conversation could interleave
  // with the teardown below. The client disables the edit affordance while a
  // turn runs, so a 409 here means the user raced one.
  if (conversationCommandBusy(id)) return "busy";
  const settle = beginConversationCommand(id);
  try {
    const cut = truncateConversation(id, turnId);
    if (!cut) return "not_found";
    await disposeConversation(id, { deleteSessions: true });
    // Outstanding SSE resume cursors point into the pre-cut feed — unserviceable
    // by definition, so drop the channel; reconnects get `sync {resync}` and
    // refetch the truncated history.
    evict(id);
    return cut;
  } finally {
    settle();
  }
}
