import { HoustonAvatar } from "@houston-ai/core";
import { Users } from "lucide-react";

interface OrgAgentCardProps {
  name: string;
  color?: string;
  /** "Managed by …" line, or null when the caller can't see managers. */
  managedBy: string | null;
  /** Plain-language who-can-use line (e.g. "3 people", "Everyone"). */
  access: string;
  /** Relative "last opened" line, or null when unknown. */
  lastOpened: string | null;
  /** Accessible label for the open action (already translated). */
  openLabel: string;
  onOpen: () => void;
}

/**
 * One agent tile in the Organization > Agents grid (Teams v2): avatar + name,
 * who manages it, how many people can use it, and when it was last opened. The
 * whole tile is the open action (keyboard-focusable button, no hover-only
 * affordance). Presentational only — the tab resolves every string.
 */
export function OrgAgentCard({
  name,
  color,
  managedBy,
  access,
  lastOpened,
  openLabel,
  onOpen,
}: OrgAgentCardProps) {
  return (
    <button
      type="button"
      aria-label={openLabel}
      onClick={onOpen}
      className="flex flex-col gap-3 rounded-xl border border-line/50 bg-card p-4 text-left transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <div className="flex items-center gap-3">
        <HoustonAvatar color={color} diameter={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          {managedBy && (
            <p className="truncate text-xs text-ink-muted">{managedBy}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <Users aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{access}</span>
        </span>
        {lastOpened && <span className="shrink-0">{lastOpened}</span>}
      </div>
    </button>
  );
}
