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
  title?: string;
  labels?: ChatParentMissionLinkLabels;
  onOpen: () => void;
}

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
