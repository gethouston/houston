import { Skeleton } from "@houston-ai/core";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { BootLanding } from "./view-guard-rules";

export function BootLandingContent({
  landing,
  children,
}: {
  landing: BootLanding;
  children: ReactElement;
}) {
  return landing.kind === "done" ? children : <BootLandingPlaceholder />;
}

/** The screen card's quiet loading shape while desktop resolves its landing. */
export function BootLandingPlaceholder() {
  const { t } = useTranslation("shell");
  return (
    <div
      role="status"
      aria-label={t("engineGate.starting")}
      data-screen="boot-landing"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center gap-3 px-4 py-6 md:px-8">
        <Skeleton className="size-5 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-36 rounded-full" />
      </div>
    </div>
  );
}
