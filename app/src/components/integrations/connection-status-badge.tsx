import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export type ConnectionStatus = "active" | "pending" | "error";

const DOT: Record<ConnectionStatus, string> = {
  active: "bg-success",
  pending: "bg-warning",
  error: "bg-destructive",
};

const TEXT: Record<ConnectionStatus, string> = {
  active: "text-success",
  pending: "text-warning",
  error: "text-destructive",
};

/** A small colored status dot, sized for inline use next to an app name. */
export function StatusDot({
  status,
  className,
}: {
  status: ConnectionStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", DOT[status], className)}
    />
  );
}

/**
 * Colored dot + colored, localized label describing a connection's live
 * status — the sober "green thing next to the name" treatment (mirrors the
 * AI Hub's `LiveStatus`), not a tinted card background.
 */
export function ConnectionStatusBadge({
  status,
}: {
  status: ConnectionStatus;
}) {
  const { t } = useTranslation("integrations");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        TEXT[status],
      )}
    >
      <StatusDot status={status} />
      {t(`status.${status}`)}
    </span>
  );
}
