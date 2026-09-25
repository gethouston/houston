import { Badge, cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import {
  sidebarGlyphDiameter,
  sidebarRingClearance,
  useSidebarAvatarDiameter,
} from "@houston-ai/layout";
import type { ReactNode } from "react";

/**
 * The rail's ONE "something is running here" treatment: a ring around whatever
 * mark sits in the glyph column. An agent row wears it around its avatar; a
 * FOLDED team's header wears it around the team's glyph, on behalf of the agent
 * rows it is hiding. Same component, because a second ring drawn a hair
 * differently would read as a second kind of running.
 *
 * It is sized off what it circles (`diameter`, the rail's 20px glyph column
 * by default), not off its contents, so every team mark wears the same 24px
 * ring. It overhangs the column by 2px a side, which the 28px row absorbs
 * vertically.
 */
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
  /** Avatar diameter; by default the rail slot's own (the person row's
   *  portrait, or the collapsed rail's smaller avatar). A surface outside the
   *  rail (the phone's drilled header) passes its own. */
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

export function NeedsYouChip({ count, label }: NeedsYouChipProps) {
  if (count <= 0) return null;

  return (
    <Badge
      variant="secondary"
      aria-label={label}
      title={label}
      className="h-5 min-w-7 bg-input/90 px-2 text-[11px] font-semibold leading-none text-ink/80"
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
