import type { KanbanItem } from "@houston-ai/board";
import type { CreatedMission } from "../../lib/created-mission-handoff";

/**
 * The two facts the cross-agent board needs to render the OPEN conversation:
 * which session to read the feed from, and which agent it belongs to. Tagged
 * with the activity it was resolved for, so a remembered identity is only ever
 * reused for the same selection.
 */
export interface OpenConversationIdentity {
  activityId: string;
  sessionKey: string;
  agentPath: string | null;
}

export interface ResolveOpenConversationArgs {
  selectedId: string | null;
  /** The selected card, when the board's item list currently holds it. */
  selectedItem: Pick<KanbanItem, "id" | "metadata"> | null;
  /** A mission created on this board whose row the sweep has not returned. */
  created: CreatedMission | null;
  /** The identity this hook last resolved from a REAL card. */
  lastResolved: OpenConversationIdentity | null;
}

/**
 * Resolve the open conversation, in order of trust: the selected card itself,
 * then the just-created fallback, then the identity the same selection last
 * resolved to.
 *
 * The third source is what keeps a chat on screen while its card is
 * TRANSIENTLY absent from the item list. The list is rebuilt from the
 * cross-agent aggregate, and a sweep that settles with an older snapshot
 * (see `lib/all-conversations-freshness.ts`) can drop a card the user is
 * looking at for a beat; keying the feed off card presence turned that beat
 * into an empty panel with no title, which read as "my chat got wiped". A
 * deletion or an archive clears the selection explicitly, so the fallback
 * never resurrects a card the user closed on purpose.
 */
export function resolveOpenConversation({
  selectedId,
  selectedItem,
  created,
  lastResolved,
}: ResolveOpenConversationArgs): OpenConversationIdentity | null {
  if (!selectedId) return null;
  if (selectedItem) {
    const sessionKey = selectedItem.metadata?.sessionKey;
    const agentPath = selectedItem.metadata?.agentPath;
    return {
      activityId: selectedId,
      sessionKey:
        typeof sessionKey === "string" && sessionKey.length > 0
          ? sessionKey
          : `activity-${selectedId}`,
      agentPath: typeof agentPath === "string" ? agentPath : null,
    };
  }
  if (created && created.activityId === selectedId) {
    return {
      activityId: selectedId,
      sessionKey: created.sessionKey,
      agentPath: created.agentPath,
    };
  }
  if (lastResolved && lastResolved.activityId === selectedId) {
    return lastResolved;
  }
  return null;
}
