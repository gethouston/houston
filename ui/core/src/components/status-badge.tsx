"use client";

import { cn } from "../utils";
import {
  STATUS_DOT_CLASS,
  STATUS_TEXT_CLASS,
  type StatusKind,
} from "./status-badge-styles";

export type { StatusKind };

export function StatusDot({
  status,
  srLabel,
  className,
}: {
  status: StatusKind;
  srLabel?: string;
  className?: string;
}) {
  const dot = (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        STATUS_DOT_CLASS[status],
        className,
      )}
    />
  );
  if (!srLabel) return dot;
  return (
    <>
      {dot}
      <span className="sr-only">{srLabel}</span>
    </>
  );
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusKind;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        STATUS_TEXT_CLASS[status],
        className,
      )}
    >
      <StatusDot status={status} />
      {label}
    </span>
  );
}
