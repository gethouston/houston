import { cn } from "@houston-ai/core";
import type { ComponentProps, ReactNode } from "react";
import { MENTION_NAME_ATTR, MENTION_SELF_ATTR } from "./mention-rehype.ts";

export interface MentionChipProps {
  name: string;
  isSelf?: boolean;
  className?: string;
  children?: ReactNode;
}

const BASE =
  "rounded-sm px-1 py-0.5 font-semibold [overflow-wrap:anywhere] whitespace-normal";

const OTHER =
  "bg-chip text-chip-text group-[.is-user]:bg-bubble-chip group-[.is-user]:text-bubble-chip-text";

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

type MarkdownNode = { properties?: Record<string, unknown> };

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
