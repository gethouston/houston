import { Badge, cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import {
  sidebarGlyphDiameter,
  sidebarRingClearance,
  useSidebarAvatarDiameter,
} from "@houston-ai/layout";
import type { ReactNode } from "react";

export function RunningRing({
  label,
  diameter = sidebarGlyphDiameter,
  children,
}: {
  label: string;
  diameter?: number;
  children: ReactNode;
}) {
  const ring = diameter + sidebarRingClearance;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full flex items-center justify-center",
        "avatar-running-ring",
      )}
      style={{ width: ring, height: ring }}
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
  diameter?: number;
}

export function AgentSidebarIcon({
  color,
  running,
  runningLabel,
  diameter: explicit,
}: AgentSidebarIconProps) {
  const railDiameter = useSidebarAvatarDiameter();
  const diameter = explicit ?? railDiameter;
  const avatar = (
    <HoustonAvatar color={resolveAgentColor(color)} diameter={diameter} />
  );

  if (!running) return avatar;

  return (
    <RunningRing label={runningLabel} diameter={diameter}>
      {avatar}
    </RunningRing>
  );
}

interface NeedsYouChipProps {
  count: number;
  label: string;
}

const RAIL_BADGE_CLASS =
  "h-5 min-w-7 bg-input/90 px-2 text-[11px] font-semibold leading-none text-ink/80";

export function NeedsYouChip({ count, label }: NeedsYouChipProps) {
  if (count <= 0) return null;

  return (
    <Badge
      variant="secondary"
      aria-label={label}
      title={label}
      className={RAIL_BADGE_CLASS}
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

export function NewAgentChip({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className={RAIL_BADGE_CLASS}>
      {label}
    </Badge>
  );
}
