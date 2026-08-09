import { Avatar, AvatarFallback, AvatarImage } from "@houston-ai/core";
import type { ReactNode } from "react";
import { initialsFor } from "./people-tab-model.ts";

/**
 * The ONE person row Houston lists people with: a face, a name (plus a quiet
 * "you" marker on the caller's own row), an optional second identity line, and
 * exactly ONE trailing control on the right.
 *
 * It exists because the shape had been forked byte-for-byte across surfaces —
 * the team Members card and the Permissions agent People tab — and a fork is
 * how two lists of people start reading differently. The shell owns the flat
 * page language (transparent row, no card chrome, so the section's own rhythm
 * carries the list) and the identity typography; it knows nothing about teams,
 * agents or access levels, which is what keeps it reusable for the next list.
 *
 * The trailing control is the caller's `children`: a dropdown, a static label,
 * whatever that surface's one decision is. A control that opens a menu should
 * wear {@link personRowTriggerClass} so every people list's right edge is the
 * same pill at every width.
 */
export function PersonRow({
  name,
  avatarUrl,
  isSelf,
  selfLabel,
  secondary,
  children,
}: {
  /** The primary identity line, and the source of the avatar initials. */
  name: string;
  /** Resolved avatar photo, or null/undefined for initials-only. */
  avatarUrl?: string | null;
  /** Marks this as the caller's own row. */
  isSelf?: boolean;
  /** The translated "you" marker, rendered only when `isSelf`. */
  selfLabel?: string;
  /** A second, muted identity line (an org role, a standing). Omitted keeps
   *  the identity block to a single line. */
  secondary?: ReactNode;
  /** The row's one trailing control. */
  children?: ReactNode;
}) {
  const primary = (
    <>
      {name}
      {isSelf && selfLabel && (
        <span className="ml-1.5 text-xs text-ink-muted">{selfLabel}</span>
      )}
    </>
  );

  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <Avatar>
        {avatarUrl && (
          <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        )}
        <AvatarFallback className="text-xs">{initialsFor(name)}</AvatarFallback>
      </Avatar>
      {secondary === undefined ? (
        <p className="min-w-0 flex-1 truncate text-sm text-ink">{primary}</p>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{primary}</p>
          <p className="truncate text-[13px] text-ink-muted">{secondary}</p>
        </div>
      )}
      {children}
    </li>
  );
}

/**
 * The dropdown trigger a person row's trailing control wears: a pill that shows
 * its current value at rest (never hover-gated), sized to the row's 32px rhythm
 * and dimmed while a write on the row is in flight. Defined once here so the
 * two people lists cannot drift apart one utility at a time.
 */
export const personRowTriggerClass =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-sm text-ink hover:bg-chip focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:opacity-50";
