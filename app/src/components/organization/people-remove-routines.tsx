import { Badge, Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  memberRoutineKey,
  type RemoveRoutinesNote,
} from "./people-remove-model";

/**
 * The remove confirmation's routines section: which routines this person set
 * up will stop (they run on that person's own connected apps, and nothing
 * moves them to anyone else). Loading and failure stay quiet one-liners; a
 * failure was already reported, and the removal still works.
 */
export function PeopleRemoveRoutines({ note }: { note: RemoveRoutinesNote }) {
  const { t } = useTranslation("teams");
  if (note.kind === "none") return null;
  if (note.kind === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner />
        {t("people.removeConfirm.routinesLoading")}
      </p>
    );
  }
  if (note.kind === "failed") {
    return (
      <p className="text-sm text-ink-muted">
        {t("people.removeConfirm.routinesFailed")}
      </p>
    );
  }
  const { routines } = note;
  return (
    <section className="space-y-2">
      <p className="text-sm text-ink">
        {t("people.removeConfirm.routinesTitle", { count: routines.length })}
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {routines.map((routine) => (
          <li
            key={memberRoutineKey(routine)}
            className="flex min-w-0 items-center gap-2 text-sm"
          >
            <span className="min-w-0 truncate text-ink">
              {routine.name || t("people.removeConfirm.untitledRoutine")}
            </span>
            <span className="min-w-0 shrink truncate text-ink-muted">
              {routine.agentName}
            </span>
            {!routine.enabled && (
              <Badge variant="secondary">
                {t("people.removeConfirm.paused")}
              </Badge>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">
        {t("people.removeConfirm.routinesHint")}
      </p>
    </section>
  );
}
