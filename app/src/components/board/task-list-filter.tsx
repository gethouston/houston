import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown, ListFilter } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TASK_LIST_FILTER_IDS,
  type TaskListFilterId,
} from "./task-list-model.ts";

/**
 * The task list's status filter: one pill that names the band the list is
 * narrowed to ("All" by default) and drops a radio menu of the four choices —
 * All, Needs you, Running, Done — the same pill grammar the Agents home's
 * team selector wears, so narrowing a list reads the same wherever the user
 * found one.
 *
 * ONE control for every phone task list (an agent's, a team's): the same
 * choices in the same order with the same words.
 *
 * The choices are a NARROWING of the same sectioned list, not four screens:
 * "All" keeps the sections stacked, and picking one leaves only that section
 * standing. Needs you carries its count, because that number is the reason a
 * user came here at all; the other choices carry no badge, so the menu does
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
  /** Stamped on every choice (and `<testId>-trigger` on the pill), so a spec
   *  can address the list it means. */
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
    <div className="mx-4 mb-2 self-start">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("shell:taskList.filter.label")}
            data-testid={`${testId}-trigger`}
            data-filter={active}
            className="ht-hairline inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-chip px-3 text-[13px] font-weight-510 text-ink transition-colors hover:bg-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <ListFilter
              aria-hidden
              className="size-4 shrink-0 text-ink-muted"
            />
            <span className="min-w-0 truncate">{labels[active]}</span>
            {active === "needs_you" && needsYouCount > 0 ? (
              <span className="tabular-nums text-ink-muted">
                {needsYouCount}
              </span>
            ) : null}
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-ink-muted"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuRadioGroup
            value={active}
            onValueChange={(value) => onSelect(value as TaskListFilterId)}
          >
            {TASK_LIST_FILTER_IDS.map((id) => (
              <DropdownMenuRadioItem
                key={id}
                value={id}
                data-testid={testId}
                data-filter={id}
                className="gap-2"
              >
                <span className="min-w-0 flex-1 truncate">{labels[id]}</span>
                {id === "needs_you" && needsYouCount > 0 ? (
                  <span className="tabular-nums text-ink-muted">
                    {needsYouCount}
                  </span>
                ) : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
