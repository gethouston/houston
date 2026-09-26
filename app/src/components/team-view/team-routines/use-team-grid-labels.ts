import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";

/**
 * The routines grid's labels. With the employee's read failed, "no routines"
 * is not a fact: the failure strip's Retry is the only honest next move, so
 * the empty state says exactly that (and the section drops the create button
 * competing with it).
 */
export function useTeamGridLabels({
  unreadable,
}: {
  /** The employee did not answer, so an empty grid is not evidence of none. */
  unreadable: boolean;
}) {
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
