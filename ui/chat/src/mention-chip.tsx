/**
 * The rendered form of an "@Name" run in a chat message (HOU-944): a soft,
 * non-interactive chip. A mention of the CURRENT viewer is emphasized with the
 * highlight wash so "the agent is asking ME" reads at a glance.
 *
 * Two surfaces to satisfy: assistant prose (on the chat canvas) and the user
 * bubble, whose fill is near-ink in light mode and a light wash in dark. The
 * `group-[.is-user]:` scoping mirrors what the autolink `<a>` in
 * `ai-elements/message.tsx` already does.
 */

import { cn } from "@houston-ai/core";
import type { ComponentProps, ReactNode } from "react";
import { MENTION_NAME_ATTR, MENTION_SELF_ATTR } from "./mention-rehype.ts";

export interface MentionChipProps {
  /** The name as it should read, WITHOUT the leading "@". */
  name: string;
  /** The mention points at the signed-in viewer. */
  isSelf?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Shared shape: a chip radius from the scale, tight spacing-scale padding, and
 *  the semibold weight that lifts a name out of running prose. */
const BASE =
  "rounded-sm px-1 py-0.5 font-semibold [overflow-wrap:anywhere] whitespace-normal";

/** Someone else. Soft chip fill on the canvas; inside the user bubble a light
 *  wash over the near-ink fill (light) / an ink wash over the light fill
 *  (dark), so it reads in both. */
const OTHER =
  "bg-chip text-chip-text group-[.is-user]:bg-input/20 group-[.is-user]:text-input dark:group-[.is-user]:bg-ink/10 dark:group-[.is-user]:text-ink";

/** The viewer. The highlight wash carries in both themes; inside the light
 *  user bubble the wash sits over near-ink, so the label flips to the bubble's
 *  own foreground rather than the highlight ink. */
const SELF =
  "bg-highlight text-highlight-text group-[.is-user]:text-input dark:group-[.is-user]:text-highlight-text";

export function MentionChip({
  name,
  isSelf = false,
  className,
  children,
}: MentionChipProps) {
  return (
    <span
      data-mention-chip=""
      data-mention-self={isSelf ? "" : undefined}
      className={cn(BASE, isSelf ? SELF : OTHER, className)}
    >
      {children ?? `@${name}`}
    </span>
  );
}

/** What react-markdown hands a component override alongside the DOM props. */
type MarkdownNode = { properties?: Record<string, unknown> };

/**
 * The `components.span` override Streamdown renders every `<span>` through.
 * Spans minted by `mentionRehypePlugin` become chips; every other span (KaTeX
 * output, raw HTML the sanitizer kept) passes through untouched.
 */
export function MentionMarkdownSpan({
  node,
  children,
  ...rest
}: ComponentProps<"span"> & { node?: unknown }) {
  const properties = (node as MarkdownNode | undefined)?.properties;
  const name = properties?.[MENTION_NAME_ATTR];
  if (typeof name !== "string") {
    return <span {...rest}>{children}</span>;
  }
  return (
    <MentionChip
      isSelf={properties?.[MENTION_SELF_ATTR] !== undefined}
      name={name}
    >
      {children}
    </MentionChip>
  );
}
