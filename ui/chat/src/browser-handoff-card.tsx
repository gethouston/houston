"use client";

import {
  CheckIcon,
  CircleSlashIcon,
  ClockIcon,
  GlobeIcon,
  type LucideIcon,
  XIcon,
} from "lucide-react";
import { useRef } from "react";
import type { BrowserHandoffCardState } from "./browser-live-types";

export interface BrowserHandoffCardLabels {
  heading: (site: string) => string;
  headingNoSite: string;
  open: string;
  openLabel: (site: string | null) => string;
  done: string;
  cancelled: string;
  expired: string;
  ended: string;
}

export const DEFAULT_BROWSER_HANDOFF_CARD_LABELS: BrowserHandoffCardLabels = {
  heading: (site) => `Your turn on ${site}`,
  headingNoSite: "Your turn in the browser",
  open: "Open",
  openLabel: (site) =>
    site ? `Open the browser for ${site}` : "Open the browser",
  done: "Done",
  cancelled: "Not finished",
  expired: "Time ran out",
  ended: "No longer waiting",
};

export interface BrowserHandoffCardProps {
  site: string | null;
  task: string;
  state: BrowserHandoffCardState;
  onOpen?: () => void;
  labels?: Partial<BrowserHandoffCardLabels>;
}

type Outcome = Exclude<BrowserHandoffCardState, "waiting">;

const NEUTRAL = "bg-chip text-ink-muted";
const OUTCOME: Record<Outcome, { icon: LucideIcon; tone: string }> = {
  done: { icon: CheckIcon, tone: "bg-success/10 text-success-ink" },
  cancelled: { icon: XIcon, tone: NEUTRAL },
  expired: { icon: ClockIcon, tone: NEUTRAL },
  ended: { icon: CircleSlashIcon, tone: NEUTRAL },
};

function OutcomeChip({
  state,
  labels,
}: {
  state: Outcome;
  labels: BrowserHandoffCardLabels;
}) {
  const { icon: Icon, tone } = OUTCOME[state];
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-xs font-medium ${tone}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span>{labels[state]}</span>
    </span>
  );
}

export function BrowserHandoffCard({
  site,
  task,
  state,
  onOpen,
  labels: labelOverrides,
}: BrowserHandoffCardProps) {
  const labels = { ...DEFAULT_BROWSER_HANDOFF_CARD_LABELS, ...labelOverrides };
  const heading = site ? labels.heading(site) : labels.headingNoSite;
  const waiting = state === "waiting";
  const mountedState = useRef(state);
  const swap = mountedState.current === state ? "" : "browser-handoff-swap-in";
  return (
    <div
      className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-line/60 bg-input p-3 md:max-w-md"
      data-state={state}
    >
      <span
        aria-hidden="true"
        className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink-muted"
      >
        <GlobeIcon className="size-5" />
        {waiting ? (
          <span className="browser-handoff-live-dot absolute top-0.5 right-0.5 size-2.5 rounded-full bg-action ring-2 ring-input" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-ink [overflow-wrap:anywhere]">
          {heading}
        </p>
        {task ? (
          <p className="line-clamp-2 text-xs text-ink-muted">{task}</p>
        ) : null}
        <div
          className={`mt-2 flex min-h-11 items-center md:min-h-9 ${swap}`}
          key={state}
        >
          {waiting ? (
            <button
              aria-label={labels.openLabel(site)}
              className="inline-flex min-h-11 items-center rounded-full bg-action px-5 text-sm font-medium text-action-text outline-none transition-transform duration-150 ease-out hover:bg-action/80 focus-visible:ring-[3px] focus-visible:ring-focus/50 active:scale-[0.97] disabled:cursor-default disabled:opacity-50 md:min-h-9 md:px-4"
              disabled={!onOpen}
              onClick={onOpen}
              type="button"
            >
              {labels.open}
            </button>
          ) : (
            <OutcomeChip labels={labels} state={state} />
          )}
        </div>
      </div>
    </div>
  );
}
