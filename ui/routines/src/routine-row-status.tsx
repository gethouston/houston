import { cn } from "@houston-ai/core";
import { Bell, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { Routine, RoutineRun } from "./types";

export interface RoutineRowStatusProps {
  routine: Routine;
  lastRun?: RoutineRun;
  isPaused: boolean;
  identityIcon?: ReactNode;
}

export function RoutineRowStatus({
  routine,
  lastRun,
  isPaused,
  identityIcon,
}: RoutineRowStatusProps) {
  const identity =
    identityIcon ??
    (routine.trigger ? (
      <Bell className="size-4 text-ink-muted" aria-hidden />
    ) : (
      <Clock className="size-4 text-ink-muted" aria-hidden />
    ));

  const running = routine.enabled && lastRun?.status === "running" && !isPaused;
  const errored =
    routine.enabled && lastRun?.status === "error" && !routine.trigger;

  return (
    <span className="relative inline-grid size-6 shrink-0 place-items-center">
      {running && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-focus/40 animate-pulse"
        />
      )}
      {!running && errored && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-danger/40"
        />
      )}
      <span
        className={cn(
          "inline-grid size-4 place-items-center",
          "[&_img]:size-4 [&_svg]:size-4 [&_svg]:shrink-0",
        )}
      >
        {identity}
      </span>
    </span>
  );
}
