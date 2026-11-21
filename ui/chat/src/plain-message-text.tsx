import { Fragment, type ReactNode } from "react";
import { Autolink } from "./autolink";
import { autolinkDisplay } from "./markdown-link";
import { MentionChip } from "./mention-chip";
import { findMentionSpans, type MentionTarget } from "./mention-spans.ts";
import { normalizeMentionText } from "./mention-text.ts";

export interface PlainMessageTextProps {
  text: string;
  mentions?: readonly MentionTarget[];
  onOpenLink?: (url: string) => void;
}

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
        {autolinkDisplay(url) ?? url}
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
