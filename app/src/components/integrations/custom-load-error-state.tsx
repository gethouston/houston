import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/** A failed custom-list read stays loud and retryable when no cached rows exist. */
export function CustomLoadErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("integrations");
  return (
    <section className="flex flex-col items-start gap-2 py-4">
      <p className="text-sm text-ink-muted">{t("custom.loadError")}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t("custom.retry")}
      </Button>
    </section>
  );
}
