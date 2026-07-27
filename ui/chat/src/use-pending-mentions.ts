/**
 * The composer's pending @mention picks as React state (HOU-944) — a thin
 * wrapper over the pure per-draft map in `mention-pending.ts`.
 *
 * The map lives in a ref, not in state: nothing renders from it, and a pick
 * must not repaint the message list. It is keyed by draft, so a conversation
 * switch neither loses the picks parked in the one you left nor attaches them
 * to the one you arrived at.
 */

import { useCallback, useRef } from "react";
import type { PendingMentions } from "./mention-pending.ts";
import { dropPending, readPending, recordPending } from "./mention-pending.ts";
import { resolveMentions } from "./mention-send.ts";
import type { MessageMention } from "./types";

export interface PendingMentionsApi {
  /** Park a pick under the active draft. */
  record: (mention: MessageMention) => void;
  /** The picks `sent` still contains. Does NOT clear: a send that fails keeps
   *  its text, so it must keep the mentions that text refers to. */
  mentionsFor: (sent: string) => MessageMention[];
  /** Drop the active draft's picks. Call ONLY once the send resolved. */
  commitSent: () => void;
}

export function usePendingMentions(draftKey: string): PendingMentionsApi {
  const drafts = useRef<PendingMentions>(new Map());

  const record = useCallback(
    (mention: MessageMention) =>
      recordPending(drafts.current, draftKey, mention),
    [draftKey],
  );
  const mentionsFor = useCallback(
    (sent: string) =>
      resolveMentions(sent, readPending(drafts.current, draftKey)),
    [draftKey],
  );
  const commitSent = useCallback(
    () => dropPending(drafts.current, draftKey),
    [draftKey],
  );

  return { record, mentionsFor, commitSent };
}
