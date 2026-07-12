import { cn } from "@houston-ai/core";
import type React from "react";
import type { AppDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import {
  type ConnectionStatus,
  ConnectionStatusBadge,
} from "./connection-status-badge";

/**
 * The generic integrations list row shared by both surfaces: logo + name (+ a
 * live status dot + label, right of the name) + description, a trailing
 * action slot, and an optional `children` block that renders under the main
 * line (used for the pending / error recovery callouts). Renders as a button
 * when `onClick` is given, otherwise a plain row. Actions live in `trailing`,
 * never hover-gated. The card itself stays the plain neutral surface — status
 * reads from the dot + label, not a tinted background (that read as loud/
 * cheap in review; a colored label next to the name is the sober version).
 */
export function AppRow({
  display,
  description,
  status,
  onClick,
  trailing,
  children,
}: {
  display: AppDisplay;
  description?: string;
  status?: ConnectionStatus;
  onClick?: () => void;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <AppLogo display={display} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink">
          <span className="min-w-0 truncate">{display.name}</span>
          {status && <ConnectionStatusBadge status={status} />}
        </p>
        {description && (
          <p className="truncate text-[11px] text-ink-muted">{description}</p>
        )}
        {children}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </>
  );

  const base =
    "flex items-center gap-3 rounded-xl bg-chip px-3 py-2.5 text-left";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          base,
          "w-full transition-colors hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05] focus-visible:outline-none",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
