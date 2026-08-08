import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";

/**
 * The routines grid's labels, with the team section's own wording for the ONE
 * thing a cross-agent list says differently: its empty state.
 *
 * The grid owns that state; the section only words it. Across the team "no
 * routines" is a fact about the team, so it says so; narrowed to one agent the
 * per-agent copy is the honest one. With every read failed neither is a fact —
 * the failure strip's Retry is the only honest next move, so the empty state
 * says exactly that (and the section drops the create button competing with
 * it).
 */
export function useTeamGridLabels({
  oneOwner,
  unreadable,
}: {
  /** One agent in view: the per-agent copy is the honest one. */
  oneOwner: boolean;
  /** No agent answered, so an empty grid is not evidence of an empty team. */
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
  if (oneOwner) return labels.grid;
  return {
    ...labels.grid,
    emptyTitle: t("teams:teamView.routines.noRoutines.title"),
    emptyDescription: t("teams:teamView.routines.noRoutines.body"),
  };
}
