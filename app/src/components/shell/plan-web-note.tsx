import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * What the store apps say where a price, a checkout or a billing portal would
 * be: plain text, never a link or a button, because the stores forbid pointing
 * to a purchase outside their own in-app payment (`purchase-policy`).
 * `managed` names the website (Billing screens); `manage` is the short line a
 * limit or a notice ends on.
 */
export function PlanWebNote({
  variant,
  className,
}: {
  variant: "managed" | "manage";
  /** Placement only (alignment, spacing). */
  className?: string;
}) {
  const { t } = useTranslation("plan");
  return (
    <p className={cn("text-sm text-ink-muted", className)}>
      {variant === "managed" ? t("managedOnWeb") : t("manageOnWeb")}
    </p>
  );
}
