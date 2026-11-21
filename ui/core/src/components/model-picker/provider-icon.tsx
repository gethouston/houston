import type * as React from "react";
import { cn } from "../../utils";

export function ProviderIcon({
  providerId,
  name,
  render,
  className,
}: {
  providerId: string;
  name: string;
  render?: (providerId: string, className?: string) => React.ReactNode;
  className?: string;
}) {
  if (render) return <>{render(providerId, className)}</>;
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-md bg-chip-subtle text-[0.7rem] font-bold text-ink-muted",
        className,
      )}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
