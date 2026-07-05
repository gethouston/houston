import { cn } from "@houston-ai/core";
import type React from "react";
import type { AppDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { type ConnectionStatus, StatusDot } from "./connection-status-badge";

/**
 * The generic integrations list row shared by both surfaces: logo + name (+ an
 * optional live status dot) + description, a trailing action slot, and an
 * optional `children` block that renders under the main line (used for the
 * pending / error recovery callouts). Renders as a button when `onClick` is
 * given, otherwise a plain row. Actions live in `trailing`, never hover-gated.
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
        <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground">
          <span className="truncate">{display.name}</span>
          {status && <StatusDot status={status} />}
        </p>
        {description && (
          <p className="truncate text-[11px] text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </>
  );

  const base =
    "flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          base,
          "w-full transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:outline-none",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
