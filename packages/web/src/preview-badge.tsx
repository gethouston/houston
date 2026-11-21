import { Badge } from "@houston-ai/core";
import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { currentDeployEnvironment } from "./deploy-environment";

export function PreviewBadge() {
  const { t } = useTranslation("common");

  if (currentDeployEnvironment() !== "preview") return null;

  return (
    <div className="pointer-events-none fixed top-6 right-16 z-40 select-none md:top-2 md:right-auto md:left-1/2 md:-translate-x-1/2">
      <Badge
        variant="outline"
        className="gap-1.5 border-line/70 bg-input/80 text-ink-muted shadow-sm backdrop-blur-sm"
      >
        <FlaskConical aria-hidden="true" />
        <span className="sr-only md:not-sr-only">{t("env.preview")}</span>
      </Badge>
    </div>
  );
}
