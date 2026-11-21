"use client";

import { HoustonAvatar } from "@houston-ai/core";
import { ArrowUpRight } from "lucide-react";
import type { TurnEndSummary } from "./turn-tools";

export interface StartedMission {
  id: string;
  title: string;
  agent: string;
}

export function startedMissions(summary: TurnEndSummary): StartedMission[] {
  return summary.tools.flatMap((tool) => {
    if (
      (tool.name !== "start_mission" &&
        !tool.name.endsWith("__start_mission")) ||
      tool.result?.is_error
    )
      return [];
    const mission = tool.result?.mission;
    return mission ? [mission] : [];
  });
}

export interface ChatStartedMissionCardLabels {
  heading: (agentName: string) => string;
  open: string;
  openMission: (title: string) => string;
  unavailable: string;
}

const DEFAULT_LABELS: ChatStartedMissionCardLabels = {
  heading: (agentName) => `${agentName} is on it`,
  open: "Open",
  openMission: (title) => `Open ${title}`,
  unavailable: "No longer on your team",
};

export interface ChatStartedMissionCardProps {
  mission: StartedMission;
  agentName: string;
  agentColor?: string;
  onOpen?: () => void;
  labels?: ChatStartedMissionCardLabels;
}

export function ChatStartedMissionCard({
  mission,
  agentName,
  agentColor,
  onOpen,
  labels = DEFAULT_LABELS,
}: ChatStartedMissionCardProps) {
  return (
    <div className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-line/60 bg-input p-3 md:max-w-md">
      <HoustonAvatar color={agentColor} diameter={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {labels.heading(agentName)}
        </p>
        <p className="truncate text-xs text-ink-muted">{mission.title}</p>
        {!onOpen ? (
          <p className="text-xs text-ink-muted">{labels.unavailable}</p>
        ) : null}
      </div>
      <button
        aria-label={labels.openMission(mission.title)}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-ink outline-none hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:cursor-default disabled:text-ink-muted"
        disabled={!onOpen}
        onClick={onOpen}
        type="button"
      >
        {labels.open}
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
