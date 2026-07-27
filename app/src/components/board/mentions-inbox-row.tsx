import { cn, Skeleton } from "@houston-ai/core";
import { AtSign } from "lucide-react";
import { PersonFace } from "../mission-person-face";
import { formatRelativeTime } from "../organization/org-time";
import type { MentionInboxRow } from "./mentions-inbox-model";

/**
 * One row of the Mentions inbox, in Mission Control's flat "plane" language:
 * a transparent full-width button that fills on hover, never a bordered card.
 *
 * Layout is a fixed four-track line so read and unread rows stay optically
 * aligned: a 8px unread rail, the mentioner's face, the mission title over the
 * "who + where" line, and the relative time flushed right. The rail is always
 * reserved (not conditionally rendered) because a dot that inserts itself would
 * shift every unread title 20px to the right of its read neighbours.
 *
 * Unread is carried by the same quiet pair the sidebar uses, a filled
 * `bg-action` dot plus a medium title. No colour beyond that: a mention is a
 * claim on attention, not a status.
 */
export interface MentionRowLabels {
  /** "Ana mentioned you", already resolved to a display name. */
  by: string;
  /** "in Finance". */
  agent: string;
}

export function MentionsInboxRow({
  row,
  labels,
  avatarLabel,
  avatarUrl,
  locale,
  onOpen,
}: {
  row: MentionInboxRow;
  labels: MentionRowLabels;
  /** Display name behind the face. Never a raw user id. */
  avatarLabel: string;
  avatarUrl?: string;
  locale: string;
  onOpen: (row: MentionInboxRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span aria-hidden className="flex w-2 shrink-0 justify-center">
        {row.unread && <span className="size-2 rounded-full bg-action" />}
      </span>
      {row.byUserId ? (
        <PersonFace
          person={{
            id: row.byUserId,
            label: avatarLabel,
            ...(avatarUrl ? { imageUrl: avatarUrl } : {}),
          }}
        />
      ) : (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-chip text-chip-text">
          <AtSign className="size-3" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm text-ink",
            row.unread && "font-medium",
          )}
        >
          {row.title}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          {`${labels.by} ${labels.agent}`}
        </span>
      </span>
      <span className="shrink-0 text-xs text-ink-muted tabular-nums">
        {formatRelativeTime(row.at, locale)}
      </span>
    </button>
  );
}

/** Placeholder row mirroring {@link MentionsInboxRow}'s tracks, so the list
 *  does not shift when the real rows land. */
export function MentionsInboxRowSkeleton() {
  return (
    <div className="flex min-h-11 w-full items-center gap-3 px-3 py-2">
      <span className="w-2 shrink-0" />
      <Skeleton className="size-5 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-3 w-10 shrink-0" />
    </div>
  );
}
