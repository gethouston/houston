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
 *
 * On the phone the top bar's middle is the screen's title, so the pill steps
 * out of the way: icon only, tucked beside the compose control, level with
 * the row. Desktop keeps the labelled pill centered at the top.
 */
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
