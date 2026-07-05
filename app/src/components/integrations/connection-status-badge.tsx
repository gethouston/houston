import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export type ConnectionStatus = "active" | "pending" | "error";

const DOT: Record<ConnectionStatus, string> = {
  active: "bg-emerald-500",
  pending: "bg-amber-500",
  error: "bg-destructive",
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

/** Colored dot + localized label describing a connection's live status. */
export function ConnectionStatusBadge({
  status,
}: {
  status: ConnectionStatus;
}) {
  const { t } = useTranslation("integrations");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <StatusDot status={status} />
      {t(`status.${status}`)}
    </span>
  );
}
