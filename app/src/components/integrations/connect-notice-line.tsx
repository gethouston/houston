import { cn } from "@houston-ai/core";
import { Check, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectNotice } from "./connect-flow-run";

export function ConnectNoticeLine({
  appName,
  notice,
}: {
  appName: string;
  notice: ConnectNotice;
}) {
  const { t } = useTranslation("integrations");
  if (notice === "connected") {
    return (
      <NoticeLine
        icon={<Check aria-hidden className="size-3.5" strokeWidth={2.5} />}
        tone="success"
      >
        {t("waiting.connected")}
      </NoticeLine>
    );
  }
  if (notice === "failed") {
    return (
      <NoticeLine
        icon={<TriangleAlert aria-hidden className="size-3.5" />}
        tone="danger"
      >
        {t("waiting.failed")}
      </NoticeLine>
    );
  }
  if (notice === "cancelled") {
    return <NoticeLine tone="muted">{t("waiting.cancelled")}</NoticeLine>;
  }
  return (
    <NoticeLine tone="muted">
      {t("waiting.stopped", { app: appName })}
    </NoticeLine>
  );
}

export function NoticeLine({
  icon,
  tone,
  children,
}: {
  icon?: ReactNode;
  tone: "muted" | "success" | "danger";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5",
        tone === "success"
          ? "text-success"
          : tone === "danger"
            ? "text-danger"
            : "text-ink-muted",
      )}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </p>
  );
}
