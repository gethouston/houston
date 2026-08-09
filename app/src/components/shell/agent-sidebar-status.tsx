import { Badge, cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import type { ReactNode } from "react";

/**
 * The rail's ONE "something is running here" treatment: a ring around whatever
 * mark sits in the glyph column. An agent row wears it around its avatar; a
 * FOLDED team's header wears it around the team's glyph, on behalf of the agent
 * rows it is hiding. Same component, because a second ring drawn a hair
 * differently would read as a second kind of running.
 */
export function RunningRing({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "size-6 shrink-0 rounded-full flex items-center justify-center",
        "avatar-running-ring",
      )}
      title={label}
    >
      {children}
    </span>
  );
}

interface AgentSidebarIconProps {
  color?: string;
  running: boolean;
  runningLabel: string;
}

export function AgentSidebarIcon({
  color,
  running,
  runningLabel,
}: AgentSidebarIconProps) {
  const avatar = (
    <HoustonAvatar color={resolveAgentColor(color)} diameter={20} />
  );

  if (!running) return avatar;

  return <RunningRing label={runningLabel}>{avatar}</RunningRing>;
}

interface NeedsYouChipProps {
  count: number;
  label: string;
}

export function NeedsYouChip({ count, label }: NeedsYouChipProps) {
  if (count <= 0) return null;

  return (
    <Badge
      variant="outline"
      aria-label={label}
      title={label}
      className="h-5 min-w-7 bg-input/90 px-2 text-[11px] font-semibold leading-none text-ink/80"
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
