import { useMemo } from "react";
import { useAllConversations } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useReadCursorStore } from "../../hooks/use-read-cursors";
import { useSession } from "../../hooks/use-session";
import { isMultiplayer } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import {
  buildMentionInbox,
  inboxSweepPending,
  type MentionInboxConversation,
} from "./mentions-inbox-model";
import { agentsByPath } from "./mission-card-agent";

/**
 * Everything the Inbox screen, its rail badge AND the notifications bell read,
 * in one hook, so the number on the row, the number on the bell and the rows
 * behind both are derived from one list. Every consumer shares the one
 * `useAllConversations` query, so mounting this three times costs no extra
 * fetch (*the one-sweep rule*, `teams-ui.md`).
 *
 * **A MENTION IS A TEAM FACT, and the gate lives HERE.** Off multiplayer there
 * is nobody to be mentioned BY, so the answer is empty: no rows, no count, on
 * every surface at once. It was previously each consumer's job (the bell passed
 * an empty roster), and the moment a third consumer arrived it drifted — the
 * rail badge lit on single-player desktop over an aggregate on disk that no
 * screen would show. One gate, one place, no consumer able to get it wrong.
 * The Inbox SCREEN stays reachable for everyone regardless (it is the app's
 * landing surface when no team has resolved); single player simply finds its
 * honest empty state.
 *
 * `mentionCount` counts `mentionOutstanding`, NOT the broader row `unread`
 * flag: the badge and the bell say "N unread mentions" out loud, so counting a
 * mission that merely moved would announce teammates typing my name when nobody
 * did. The rows keep their broader dot, which claims only "something new here"
 * (see `mentions-inbox-model.ts` for the two claims). Nothing renders the
 * row-level unread total today, so the hook does not compute one.
 */
export function useMentionInbox(agents: Agent[]) {
  const { data: session } = useSession();
  const { capabilities } = useCapabilities();
  const mentionsExist = isMultiplayer(capabilities);
  const selfId = session?.uid ?? null;
  const cursors = useReadCursorStore();
  // An empty roster off multiplayer: no paths, so the sweep this hook would
  // otherwise join is never even asked for on a deployment with no mentions.
  const paths = useMemo(
    () => (mentionsExist ? agents.map((a) => a.folderPath) : []),
    [agents, mentionsExist],
  );
  const { data, isPending } = useAllConversations(paths);
  // An empty roster disables the sweep query, and a disabled query never
  // leaves `pending` — see inboxSweepPending. Without this, a new team space
  // (or a just-invited member) stared at the Inbox skeleton forever.
  const pending = inboxSweepPending(isPending, paths.length);
  const conversations: MentionInboxConversation[] = useMemo(
    () => data ?? [],
    [data],
  );
  const rows = useMemo(
    () =>
      buildMentionInbox(conversations, cursors, selfId, agentsByPath(agents)),
    [conversations, cursors, selfId, agents],
  );
  const mentionCount = useMemo(
    () => rows.reduce((n, row) => n + (row.mentionOutstanding ? 1 : 0), 0),
    [rows],
  );
  return { rows, conversations, mentionCount, isPending: pending };
}
