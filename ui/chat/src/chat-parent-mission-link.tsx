"use client";

import { CornerUpLeft } from "lucide-react";

export interface ChatParentMissionLinkLabels {
  label: string;
}

export const DEFAULT_CHAT_PARENT_MISSION_LINK_LABELS: ChatParentMissionLinkLabels =
  {
    label: "Go to main mission",
  };

export interface ChatParentMissionLinkProps {
  /** The parent mission's title, shown beside the label when present. */
  title?: string;
  labels?: ChatParentMissionLinkLabels;
  /** Opens the parent mission's own chat. */
  onOpen: () => void;
}

/**
 * The way back UP the fan-out (PRODUCT-1244): a mission the agent started
 * links to the chat that started it, as one bar above the composer — the
 * child-side twin of the child-mission drawer (a chat shows one or the other,
 * never both: spawned missions can't spawn). Same bordered-card clothes, so
 * the two read as one navigation family.
 */
export function ChatParentMissionLink({
  title,
  labels = DEFAULT_CHAT_PARENT_MISSION_LINK_LABELS,
  onOpen,
}: ChatParentMissionLinkProps) {
  return (
    <button
      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line/60 bg-input px-3 py-2 text-ink-muted text-xs outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/50"
      onClick={onOpen}
      type="button"
    >
      <CornerUpLeft aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{labels.label}</span>
      {title ? (
        <span className="min-w-0 truncate text-ink">{title}</span>
      ) : null}
    </button>
  );
}
