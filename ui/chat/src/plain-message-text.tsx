/**
 * A HUMAN message's rendered body: plain text, never markdown (HOU-1051). What
 * the person typed is what the bubble shows — `# hello` stays `# hello` — with
 * line breaks preserved. Only the AGENT's prose goes through the markdown
 * renderer (`MessageResponse`).
 *
 * Two pieces of structure survive, messenger-style:
 * - Mention chips (HOU-944): "@Name" runs still chip, found by the same pure
 *   matcher the markdown path uses (`findMentionSpans`), so a shared
 *   conversation reads identically on both render paths. Offsets index into
 *   the NFC-normalized text, so this component slices its own normalized copy.
 * - Bare URLs (HOU-960 / #358): a pasted link stays a clickable link chip
 *   inside the bubble — the same anatomy as the markdown autolink, without a
 *   handler it degrades to plain text rather than a dead-looking link.
 */

import { Fragment, type ReactNode } from "react";
import { Autolink } from "./autolink";
import { MentionChip } from "./mention-chip";
import { findMentionSpans, type MentionTarget } from "./mention-spans.ts";
import { normalizeMentionText } from "./mention-text.ts";

export interface PlainMessageTextProps {
  text: string;
  /** The message's recorded mentions; omit to skip chipping. */
  mentions?: readonly MentionTarget[];
  /** Opens a pasted URL (system browser on desktop); absent → plain text. */
  onOpenLink?: (url: string) => void;
}

/** A pasted URL, conservatively: scheme to the next whitespace, minus the
 *  trailing punctuation a sentence hangs on it ("see https://a.com/b."). */
const URL_RUN = /https?:\/\/[^\s<>]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/;

function linkify(
  text: string,
  keyBase: number,
  onOpenLink?: (url: string) => void,
): ReactNode[] {
  if (!onOpenLink) return [<Fragment key={keyBase}>{text}</Fragment>];
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_RUN)) {
    const url = (match[0] as string).replace(TRAILING_PUNCTUATION, "");
    const start = match.index as number;
    if (start > cursor) {
      parts.push(
        <Fragment key={keyBase + cursor}>{text.slice(cursor, start)}</Fragment>,
      );
    }
    parts.push(
      <Autolink key={keyBase + start} href={url} onOpen={() => onOpenLink(url)}>
        {url}
      </Autolink>,
    );
    cursor = start + url.length;
  }
  if (cursor < text.length) {
    parts.push(
      <Fragment key={keyBase + cursor}>{text.slice(cursor)}</Fragment>,
    );
  }
  return parts;
}

export function PlainMessageText({
  text,
  mentions,
  onOpenLink,
}: PlainMessageTextProps) {
  const source = normalizeMentionText(text);
  const spans = mentions?.length ? findMentionSpans(source, mentions) : [];
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      parts.push(
        ...linkify(source.slice(cursor, span.start), cursor, onOpenLink),
      );
    }
    parts.push(
      <MentionChip
        key={`m${span.start}`}
        name={span.target.name}
        isSelf={span.target.isSelf}
      >
        {source.slice(span.start, span.end)}
      </MentionChip>,
    );
    cursor = span.end;
  }
  if (cursor < source.length) {
    parts.push(...linkify(source.slice(cursor), cursor, onOpenLink));
  }
  return <div className="whitespace-pre-wrap break-words">{parts}</div>;
}
