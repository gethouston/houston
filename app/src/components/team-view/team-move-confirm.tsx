import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { TeamMoveSource } from "../../lib/move-team";
import type { TeamRef } from "../../lib/share-via-team";

export function TeamMoveConfirm({
  source,
  target,
  onBack,
  onMove,
}: {
  source: TeamMoveSource;
  target: TeamRef;
  onBack: () => void;
  onMove: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">
        {t("moveTeam.confirm.body", {
          team: source.name,
          count: source.agents.length,
          destination: target.name,
        })}
      </p>
      <p className="text-xs text-ink-muted">{t("moveTeam.confirm.downtime")}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          {t("shareViaTeam.confirm.cancel")}
        </Button>
        <Button onClick={onMove}>{t("moveTeam.confirm.move")}</Button>
      </div>
    </div>
  );
}
