import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";

export function useTeamGridLabels({ unreadable }: { unreadable: boolean }) {
  const { t } = useTranslation(["teams", "routines"]);
  const labels = useRoutineLabels();

  if (unreadable) {
    return {
      ...labels.grid,
      emptyTitle: t("teams:teamView.routines.unreadable.title"),
      emptyDescription: t("teams:teamView.routines.unreadable.body"),
    };
  }
  return labels.grid;
}
