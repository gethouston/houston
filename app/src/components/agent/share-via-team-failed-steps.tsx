import type { MoveErrorKind } from "@houston/sdk";
import { Button } from "@houston-ai/core";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import type { TeamRef } from "../../lib/share-via-team";

export function MoveFailedStep({
  error,
  canRetry,
  onRetry,
  onClose,
}: {
  error: MoveErrorKind;
  canRetry: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="text-sm text-ink">
          {error === "needs_upgrade" && !canPurchaseInApp()
            ? t("native.moveNeedsUpgrade")
            : t(`shareViaTeam.moveFailed.${error}`)}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t("shareViaTeam.moveFailed.close")}
        </Button>
        {canRetry ? (
          <Button onClick={onRetry}>
            {t("shareViaTeam.moveFailed.retry")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SwitchFailedStep({
  team,
  onRetry,
  onClose,
}: {
  team: TeamRef;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="text-sm text-ink">
          {t("shareViaTeam.switchFailed.body", { team: team.name })}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t("shareViaTeam.switchFailed.close")}
        </Button>
        <Button onClick={onRetry}>
          {t("shareViaTeam.switchFailed.retry")}
        </Button>
      </div>
    </div>
  );
}
