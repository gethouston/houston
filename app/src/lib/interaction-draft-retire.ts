import type { SessionStatusValue } from "@houston/sdk";
import { useInteractionDraftStore } from "../stores/interaction-drafts";

const SESSION_STATUSES: readonly string[] = [
  "starting",
  "running",
  "completed",
  "error",
] satisfies SessionStatusValue[];

export const TURN_EVIDENCE_FEED_TYPES = [
  "assistant_text_streaming",
  "thinking_streaming",
  "assistant_text",
  "thinking",
  "tool_call",
  "tool_result",
  "provider_switched",
  "context_compacted",
  "context_cleared",
  "file_changes",
  "provider_error",
] as const;

const TURN_EVIDENCE: ReadonlySet<string> = new Set(TURN_EVIDENCE_FEED_TYPES);

interface FeedPush {
  feed_type: string;
  pending?: boolean;
  fails_pending?: boolean;
}

export function isSessionStatusValue(
  status: string,
): status is SessionStatusValue {
  return SESSION_STATUSES.includes(status);
}

export function retireParkedInteractionOnFeedItem(
  sessionKey: string,
  item: FeedPush,
): void {
  if (item.pending === true || item.fails_pending === true) return;
  if (!TURN_EVIDENCE.has(item.feed_type)) return;
  useInteractionDraftStore.getState().clear(sessionKey);
}

export function retireParkedInteractionOnSessionStatus(
  status: SessionStatusValue,
  sessionKey: string,
): void {
  if (status !== "completed") return;
  useInteractionDraftStore.getState().clear(sessionKey);
}
