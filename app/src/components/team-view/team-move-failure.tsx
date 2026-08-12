import { Button } from "@houston-ai/core";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function TeamMoveFailure({
  body,
  onRetry,
  onClose,
}: {
  body: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-danger" />
        <p className="text-sm text-ink">{body}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t("moveTeam.close")}
        </Button>
        <Button onClick={onRetry}>{t("moveTeam.retry")}</Button>
      </div>
    </div>
  );
}
