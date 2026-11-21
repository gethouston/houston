import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export function PlanWebNote({
  variant,
  className,
}: {
  variant: "managed" | "manage";
  className?: string;
}) {
  const { t } = useTranslation("plan");
  return (
    <p className={cn("text-sm text-ink-muted", className)}>
      {variant === "managed" ? t("managedOnWeb") : t("manageOnWeb")}
    </p>
  );
}
