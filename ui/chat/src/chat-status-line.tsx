import { cn, HoustonHelmet } from "@houston-ai/core";
import type { ReactNode } from "react";
import { Shimmer } from "./ai-elements/shimmer";

export interface ChatStatusLineProps {
  label: string;
  active?: boolean;
  iconSize?: number;
  icon?: ReactNode;
  className?: string;
}

export function ChatStatusLine({
  label,
  active,
  iconSize = 13,
  icon,
  className,
}: ChatStatusLineProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs",
        className,
      )}
    >
      {icon ?? <HoustonHelmet color="currentColor" size={iconSize} />}
      <span className="min-w-0 truncate text-left">
        {active ? <Shimmer duration={1}>{label}</Shimmer> : label}
      </span>
    </span>
  );
}
