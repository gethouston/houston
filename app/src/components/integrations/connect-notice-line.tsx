import { cn } from "@houston-ai/core";
import { Check, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectNotice } from "./connect-flow-run";

/**
 * ONE settled connect outcome as a single quiet line.
 *
 * The words are deliberately short. The TOAST is the full announcement — it has
 * to be, it is the only one that still reaches a user who navigated away — so
 * repeating the same sentence on the row said one thing three times over. What
 * belongs here is the state: "Connected", "Could not connect". The abandoned
 * case keeps its sentence because it is the actionable one: it names the Finish
 * connecting affordance the user has to come back to.
 *
 * Lives apart from {@link ConnectFlowInline} so the pending-recovery callout can
 * show the outcome ABOVE its Finish connecting / Reconnect / Remove actions
 * without pulling in the whole live-phase block — the copy that names a button
 * must never be what hides it.
 */
export function ConnectNoticeLine({
  appName,
  notice,
}: {
  /** The app's real name, never the machine slug. */
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
  return (
    <NoticeLine tone="muted">
      {t("waiting.stopped", { app: appName })}
    </NoticeLine>
  );
}

/** One quiet status line: an optional leading glyph and a tone-carrying label.
 *  Shared with the inline block's `starting` phase. */
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
