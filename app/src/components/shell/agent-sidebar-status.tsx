import { Badge, cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";

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

  return (
    <span
      className={cn(
        "size-6 shrink-0 rounded-full flex items-center justify-center",
        "avatar-running-ring",
      )}
      title={runningLabel}
    >
      {avatar}
    </span>
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
      variant="outline"
      aria-label={label}
      title={label}
      className="h-5 min-w-7 bg-input/90 px-2 text-[11px] font-semibold leading-none text-ink/80"
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
