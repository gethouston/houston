import { DropdownMenuItem } from "@houston-ai/core";
import { Archive, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskListMenu } from "../board/task-list-menu";

/**
 * The per-agent task list's overflow menu: the shared "…" chip
 * ({@link TaskListMenu}) holding the two things a phone list needs but cannot
 * afford a permanent row for.
 */
export function AgentMissionsMenu({
  onSearch,
  onArchived,
}: {
  onSearch: () => void;
  onArchived: () => void;
}) {
  const { t } = useTranslation("shell");
  return (
    <TaskListMenu testId="agent-missions-menu">
      <DropdownMenuItem
        data-testid="agent-missions-menu-search"
        onSelect={onSearch}
      >
        <Search aria-hidden className="size-4" />
        {t("taskList.menu.search")}
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="agent-missions-menu-archived"
        onSelect={onArchived}
      >
        <Archive aria-hidden className="size-4" />
        {t("taskList.menu.archived")}
      </DropdownMenuItem>
    </TaskListMenu>
  );
}
