"use client";

import { ClockIcon } from "lucide-react";
import { useEffect, useState } from "react";

const MINUTE = 60_000;

export function useMinutesLeft(
  expiresAt: number,
  running: boolean,
): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || expiresAt <= 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      const left = expiresAt - at;
      if (left <= 0) return;
      timer = setTimeout(tick, ((left - 1) % MINUTE) + 1 + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, [expiresAt, running]);
  if (!running || expiresAt <= 0) return null;
  return Math.max(0, Math.ceil((expiresAt - now) / MINUTE));
}

export interface BrowserLiveTimeLeftProps {
  minutes: number;
  label: (minutes: number) => string;
  lastMinuteLabel: string;
}

export function BrowserLiveTimeLeft({
  minutes,
  label,
  lastMinuteLabel,
}: BrowserLiveTimeLeftProps) {
  const urgent = minutes <= 1;
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-xs font-medium tabular-nums ${urgent ? "bg-warning/15 text-warning-ink" : "bg-chip text-ink-muted"}`}
      data-urgent={urgent || undefined}
    >
      <ClockIcon aria-hidden="true" className="size-3.5" />
      {urgent ? lastMinuteLabel : label(minutes)}
    </span>
  );
}
