import { Badge } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * The "Custom" pill shown on cards and in the detail sheet for API-key
 * integrations the user added themselves (provider `"custom"`), so they read as
 * distinct from the ~1000-app OAuth catalog. Presentational; the caller decides
 * where it renders.
 */
export function CustomBadge({ className }: { className?: string }) {
  const { t } = useTranslation("integrations");
  return (
    <Badge variant="secondary" className={className}>
      {t("custom.badge")}
    </Badge>
  );
}
