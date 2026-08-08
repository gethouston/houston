"use client";

import { ChevronRight } from "lucide-react";
import { useId } from "react";

/** How a listed mission reads at a glance: the board's three status families. */
export type ChatMissionTone = "running" | "attention" | "done";

export interface ChatMissionListItem {
  id: string;
  title: string;
  /** Already-localized status word ("Running", "Needs You", "Done"). */
  statusLabel: string;
  tone: ChatMissionTone;
}

export interface ChatMissionListLabels {
  heading: string;
}

export const DEFAULT_CHAT_MISSION_LIST_LABELS: ChatMissionListLabels = {
  heading: "Missions started here",
};

export interface ChatMissionListProps {
  missions: ChatMissionListItem[];
  labels?: ChatMissionListLabels;
  /** Opens that mission's own chat. */
  onOpen: (id: string) => void;
}

/** Status dot colour per family — the same three the board's columns imply. */
const TONE_DOT: Record<ChatMissionTone, string> = {
  running: "bg-action",
  attention: "bg-warning",
  done: "bg-success",
};

/**
 * The missions THIS chat started, listed above the composer so a coordinating
 * mission is also its own monitor: each row is one child mission with its live
 * status, and opening a row goes to that mission's chat.
 *
 * Why a list and not a status blob: the value of a planning chat is reviewing
 * what it handed out, and the review target is the child's own conversation —
 * so every row is a control, not a readout. Rows are visible at rest (no
 * hover-gated affordance) and the list is bounded so a wide fan-out scrolls
 * instead of pushing the composer off-screen.
 */
export function ChatMissionList({
  missions,
  labels = DEFAULT_CHAT_MISSION_LIST_LABELS,
  onOpen,
}: ChatMissionListProps) {
  const headingId = useId();
  if (missions.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {/* px-2 matches the rows' own padding, so the heading and the status
          dots share one left edge. */}
      <p className="px-2 text-ink-muted text-xs" id={headingId}>
        {labels.heading}
      </p>
      {/* Named by its own visible heading, so the group is announced once and
          assistive tech can jump to it. */}
      <ul
        aria-labelledby={headingId}
        className="flex max-h-40 flex-col gap-0.5 overflow-y-auto"
      >
        {missions.map((mission) => (
          <li key={mission.id}>
            <button
              className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-focus/50"
              onClick={() => onOpen(mission.id)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[mission.tone]}`}
              />
              <span className="min-w-0 flex-1 truncate text-ink text-xs">
                {mission.title}
              </span>
              <span className="shrink-0 text-[11px] text-ink-muted">
                {mission.statusLabel}
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-ink-muted/40" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
