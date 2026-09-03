import { useTranslation } from "react-i18next";
import {
  headerLozengeClasses,
  headerLozengeTrack,
} from "../shell/page-header/header-lozenge";
import {
  TASK_LIST_FILTER_IDS,
  type TaskListFilterId,
} from "./task-list-model.ts";

/**
 * The task list's status segments, in the app's own pill grammar (the header
 * lozenge track): All, Needs you, Running, Done.
 *
 * ONE control for every phone task list (an agent's, a team's) — the same
 * segments in the same order with the same words, so narrowing a list means
 * the same thing wherever the user found it.
 *
 * The segments are a NARROWING of the same sectioned list, not four screens:
 * "All" keeps the sections stacked, and picking one leaves only that section
 * standing. Needs you carries its count, because that number is the reason a
 * user came here at all; the other segments carry no badge, so the row does
 * not turn into a scoreboard.
 */
export function TaskListFilter({
  active,
  needsYouCount,
  onSelect,
  testId,
}: {
  active: TaskListFilterId;
  needsYouCount: number;
  onSelect: (filter: TaskListFilterId) => void;
  /** Stamped on every segment, so a spec can address the list it means. */
  testId: string;
}) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const labels: Record<TaskListFilterId, string> = {
    all: t("shell:taskList.filter.all"),
    needs_you: t("dashboard:columns.needsYou"),
    running: t("dashboard:columns.running"),
    done: t("dashboard:columns.done"),
  };
  return (
    <div
      role="tablist"
      aria-label={t("shell:taskList.filter.label")}
      className={headerLozengeTrack("mx-4 mb-1 self-start overflow-x-auto")}
    >
      {TASK_LIST_FILTER_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          data-testid={testId}
          data-filter={id}
          onClick={() => onSelect(id)}
          className={headerLozengeClasses(active === id)}
        >
          {labels[id]}
          {id === "needs_you" && needsYouCount > 0 ? (
            <span className="tabular-nums">{needsYouCount}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
