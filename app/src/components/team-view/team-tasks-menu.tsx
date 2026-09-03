import { DropdownMenuItem } from "@houston-ai/core";
import { Archive, Search, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { useTaskListChrome } from "../board/task-list-chrome";
import { TaskListMenu } from "../board/task-list-menu";

/**
 * The phone Tasks screen's overflow menu, in the drilled header's one trailing
 * slot: the shared "…" chip over the three things this screen owes but has no
 * room to spell out.
 *
 * Search and Archived are the same two the per-agent list offers. Team
 * settings is here because the phone's Teams tree lists it a level up and a
 * user standing on the tasks should not have to retreat to reach it — and it
 * appears only for a caller who may actually configure the team, so the menu
 * never offers a door the gateway would refuse.
 */
export function TeamTasksMenu({
  team,
  canConfigure,
}: {
  team: TeamView;
  canConfigure: boolean;
}) {
  const { t } = useTranslation(["shell", "teams"]);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const chrome = useTaskListChrome();
  const showArchive = chrome.showArchive;
  return (
    <TaskListMenu testId="team-tasks-menu">
      <DropdownMenuItem
        data-testid="team-tasks-menu-search"
        onSelect={() => chrome.setSearchOpen(true)}
      >
        <Search aria-hidden className="size-4" />
        {t("shell:taskList.menu.search")}
      </DropdownMenuItem>
      {showArchive && (
        <DropdownMenuItem
          data-testid="team-tasks-menu-archived"
          onSelect={showArchive}
        >
          <Archive aria-hidden className="size-4" />
          {t("teams:teamView.archive.open")}
        </DropdownMenuItem>
      )}
      {canConfigure && (
        <DropdownMenuItem
          data-testid="team-tasks-menu-settings"
          onSelect={() =>
            openTeamView(team.id, "context", { teamSettingsFocus: true })
          }
        >
          <Settings aria-hidden className="size-4" />
          {t("teams:teamView.tabs.settings")}
        </DropdownMenuItem>
      )}
    </TaskListMenu>
  );
}
