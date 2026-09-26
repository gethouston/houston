import { DropdownMenuItem, DropdownMenuSeparator } from "@houston-ai/core";
import {
  Archive,
  Folder,
  type LucideIcon,
  Repeat,
  Search,
  Settings,
  UsersRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskListMenu } from "../board/task-list-menu";
import type { AgentMissionsMenuSection } from "./agent-missions-model";

const SECTION_ROWS = {
  routines: { label: "teams:teamView.tabs.routines", icon: Repeat },
  files: { label: "teams:teamView.tabs.files", icon: Folder },
  settings: { label: "teams:teamView.agentTabs.settings", icon: Settings },
} as const satisfies Record<
  AgentMissionsMenuSection,
  { label: string; icon: LucideIcon }
>;

/**
 * The per-agent task list's overflow menu: the shared "…" chip
 * ({@link TaskListMenu}) holding what a phone list needs but cannot afford a
 * permanent row for, and the doors to the employee's other sections.
 */
export function AgentMissionsMenu({
  onSearch,
  onArchived,
  onMove,
  sections,
  onOpenSection,
}: {
  onSearch: () => void;
  onArchived: () => void;
  onMove?: () => void;
  sections: readonly AgentMissionsMenuSection[];
  onOpenSection: (section: AgentMissionsMenuSection) => void;
}) {
  const { t } = useTranslation(["shell", "teams"]);
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
      {onMove && (
        <DropdownMenuItem onSelect={onMove}>
          <UsersRound aria-hidden className="size-4" />
          {t("teams:agentSettings.manage.moveTeam")}
        </DropdownMenuItem>
      )}
      {sections.length > 0 && <DropdownMenuSeparator />}
      {sections.map((section) => {
        const { label, icon: Icon } = SECTION_ROWS[section];
        return (
          <DropdownMenuItem
            key={section}
            data-testid="agent-missions-menu-section"
            data-section={section}
            onSelect={() => onOpenSection(section)}
          >
            <Icon aria-hidden className="size-4" />
            {t(label)}
          </DropdownMenuItem>
        );
      })}
    </TaskListMenu>
  );
}
