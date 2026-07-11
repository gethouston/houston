import { Badge } from "@houston-ai/core";
import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { currentDeployEnvironment } from "./deploy-environment";

/**
 * Small "Preview" pill shown ONLY on the preview deployment
 * (preview.gethouston.ai / *.web.app). It marks a non-production build so a
 * tester never mistakes preview for the live app they share with users.
 *
 * Web-only chrome: rendered by `app-tree.tsx`, never by the shared `app/src`
 * tree, so the desktop app and production web never carry it. Purely
 * informational — `pointer-events-none` means it can never intercept a click on
 * the real UI beneath it, and it sits below the toast layer (z-50) so transient
 * toasts always win.
 */
export function PreviewBadge() {
  const { t } = useTranslation("common");

  if (currentDeployEnvironment() !== "preview") return null;

  return (
    <div className="pointer-events-none fixed top-2 left-1/2 z-40 -translate-x-1/2 select-none">
      <Badge
        variant="outline"
        className="gap-1.5 border-border/70 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm"
      >
        <FlaskConical aria-hidden="true" />
        {t("env.preview")}
      </Badge>
    </div>
  );
}
