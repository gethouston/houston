import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import { latestMentionFor } from "../../lib/mission-relevance.ts";
import {
  cursorKey,
  mentionReadFloorFor,
  type ReadCursorStore,
} from "../../lib/read-cursors.ts";
import type { Agent } from "../../lib/types.ts";
import {
  isUnreadForMe,
  type UnreadConversationInput,
} from "../../lib/unread-model.ts";
import { missionCardAgentName } from "./mission-card-agent.ts";

/**
 * Pure, DOM-free model for the Mentions inbox (HOU-945): every mission where a
 * teammate typed my name, newest first.
 *
 * It is the one surface in the feature that is a LIST rather than a badge, so
 * its ordering is part of the contract: a row that reshuffles between renders
 * is a row the user misclicks. Hence the deterministic tiebreak on conversation
 * id, and hence the whole model living outside the component where it can be
 * asserted on directly.
 *
 * Display names are NOT resolved here. Mentions carry user ids; turning an id
 * into a name and an avatar is a React Query lookup, and dragging it in would
 * cost this module its node-testability for no gain — the renderer already has
 * the profile map.
 *
 * Every row carries TWO unread claims, because the two surfaces reading them ask
 * different questions and one answer cannot serve both:
 *
 * - `unread` — "there is something new for me in this mission": an outstanding
 *   @mention OR ambient movement past my read cursor ({@link isUnreadForMe}, the
 *   same verdict the board card and the sidebar paint). The ROW's dot reads it,
 *   and reading it broadly is right there: the dot promises news, not a name.
 * - `mentionOutstanding` — "somebody typed my name and I have not been back
 *   since". The notifications BELL's count reads this one, and only this one.
 *
 * Collapsing them would make the bell lie. Its accessible name is literally "N
 * unread mentions", so a mission that merely MOVED would inflate a number the
 * user reads as "N people typed my name" — the one count in the product that has
 * to mean exactly that, or the whole mention signal becomes noise.
 */

export interface MentionInboxConversation extends UnreadConversationInput {
  title: string;
  agent_name: string;
  session_key: string;
}

/** One row of the Mentions inbox. */
export interface MentionInboxRow {
  conversationId: string;
  agentPath: string;
  agentName: string;
  sessionKey: string;
  title: string;
  /** Epoch ms of the mention. */
  at: number;
  /** Who mentioned me (user id); resolve the display name at render time. */
  byUserId?: string;
  /** Something new here for me, mention or ambient movement. The row's dot. */
  unread: boolean;
  /** A mention of me newer than my read cursor for this conversation — strictly
   *  narrower than {@link MentionInboxRow.unread}. The bell's count. */
  mentionOutstanding: boolean;
}

/**
 * Every mission that @mentions me, newest mention first. Deterministic tiebreak
 * on conversation id so the list never reshuffles between renders.
 *
 * `selfId === null` yields `[]`: with nobody signed in there is no "me" to be
 * mentioned. The Inbox screen is a top-level row for EVERYONE (it is the app's
 * landing surface before any team resolves), so single player reaches this and
 * gets the honest empty list rather than a hidden screen. Guided setup chats are
 * excluded like everywhere else — they have no board card to open, so a row for
 * one would navigate nowhere.
 */
export function buildMentionInbox(
  convs: readonly MentionInboxConversation[],
  store: ReadCursorStore,
  selfId: string | null,
  agentsByPath: Map<string, Agent> = new Map(),
): MentionInboxRow[] {
  if (selfId === null) return [];

  const rows: MentionInboxRow[] = [];
  for (const conv of convs) {
    if (isSetupChatMode(conv.agent)) continue;
    const latest = latestMentionFor(conv, selfId);
    if (!latest) continue;
    rows.push({
      conversationId: conv.id,
      agentPath: conv.agent_path,
      agentName:
        missionCardAgentName(agentsByPath, conv.agent_path, conv.agent_name) ??
        conv.agent_name,
      sessionKey: conv.session_key,
      title: conv.title,
      at: latest.at,
      byUserId: latest.mention.by,
      unread: isUnreadForMe(conv, store, selfId),
      // The mention clause of `isUnreadForMe`, re-asked on its own: the same
      // helpers, the same floor (no `since` fallback — a mention names me
      // however old it is), the same strictly-after comparison. Sharing the
      // helpers rather than a copied rule is what keeps the pill and the dot
      // from drifting the next time either floor changes.
      mentionOutstanding:
        latest.at >
        mentionReadFloorFor(store, cursorKey(conv.agent_path, conv.id)),
    });
  }

  rows.sort(
    (a, b) => b.at - a.at || a.conversationId.localeCompare(b.conversationId),
  );
  return rows;
}
