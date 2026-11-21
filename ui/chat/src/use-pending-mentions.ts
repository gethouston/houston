import { useCallback, useRef } from "react";
import type { PendingMentions } from "./mention-pending.ts";
import { dropPending, readPending, recordPending } from "./mention-pending.ts";
import { resolveMentions } from "./mention-send.ts";
import type { MessageMention } from "./types";

export interface PendingMentionsApi {
  record: (mention: MessageMention) => void;
  mentionsFor: (sent: string) => MessageMention[];
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
