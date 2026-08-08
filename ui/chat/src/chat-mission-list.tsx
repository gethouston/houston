"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState } from "react";

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
 * The missions THIS chat started, a collapsible drawer above the composer so a
 * coordinating mission is also its own monitor: each row is one child mission
 * with its live status, and opening a row goes to that mission's chat.
 *
 * The drawer is OPEN by default — the children are this chat's real "what
 * next" — and its title is the toggle: collapsed, only the title row remains
 * (with the count, so a closed drawer still says there is something inside).
 * The toggle is a visible control, not hover-gated, and flips instantly (a
 * high-frequency interaction, per the motion rules); only the chevron turns.
 *
 * Why rows and not a status blob: the value of a planning chat is reviewing
 * what it handed out, and the review target is the child's own conversation —
 * so every row is a control, not a readout. The open list is bounded so a wide
 * fan-out scrolls instead of pushing the composer off-screen.
 */
export function ChatMissionList({
  missions,
  labels = DEFAULT_CHAT_MISSION_LIST_LABELS,
  onOpen,
}: ChatMissionListProps) {
  const listId = useId();
  const headingId = useId();
  const [open, setOpen] = useState(true);
  if (missions.length === 0) return null;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    // The same bordered-card clothes the sibling composer offers wear
    // (chat-suggest-reusable-card), so the drawer reads as one surface.
    <div className="flex flex-col rounded-xl border border-line/60 bg-input p-1.5">
      <button
        aria-controls={listId}
        aria-expanded={open}
        className="flex items-center justify-center gap-1.5 self-center rounded-full px-2 py-1 text-ink-muted text-xs outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/50"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span id={headingId}>{labels.heading}</span>
        <span className="tabular-nums">{missions.length}</span>
        <Chevron aria-hidden="true" className="size-3.5" />
      </button>
      {open ? (
        <ul
          aria-labelledby={headingId}
          className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto"
          id={listId}
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
      ) : null}
    </div>
  );
}
