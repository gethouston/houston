import { Badge } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function TeamRoutinesHeader({
  variant,
  count,
  createButton,
}: {
  variant: "strip" | "row";
  count: number;
  createButton?: ReactNode;
}) {
  const { t } = useTranslation("routines");

  const countBadge = count > 0 && (
    <Badge variant="secondary" className="tabular-nums">
      {count}
    </Badge>
  );

  if (variant === "strip") {
    return (
      <>
        {countBadge}
        {createButton}
      </>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pt-1 pb-3">
      <h2 className="text-sm font-medium text-ink">{t("listTitle")}</h2>
      {countBadge}
      <div className="ml-auto flex items-center gap-2">{createButton}</div>
    </div>
  );
}
