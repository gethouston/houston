import { HoustonHelmet } from "@houston-ai/core";
import { FolderPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import type { TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageContainer, PageHero } from "../shell/page-shell";
import { TeamFolderMenu } from "../shell/team-folder-menu";
import { tourAnchor } from "../shell/workspace-tour-steps";
import { agentHomeHasTeamFilter } from "./agents-home-model";
import { AgentsHomeTeamFilter } from "./agents-home-team-filter";

const chipButtonClasses =
  "flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors active:scale-[0.96] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ht-hairline disabled:opacity-50";

/**
 * The AI Employees list's title block: the title with its create controls,
 * and the group filter under it.
 *
 * The phone has no rail, so this block is where groups are managed there: New
 * group beside New AI Employee, and the picked group's own menu beside the
 * filter. Both are phone-only (`md:hidden`); the desktop manages groups from
 * the rail, and reaches this screen only as a boot landing.
 */
export function AgentsHomeHeader({
  teams,
  selected,
  onSelect,
}: {
  teams: readonly TeamView[];
  /** The group the list is narrowed to, `null` for every group. */
  selected: TeamView | null;
  onSelect: (teamId: string | null) => void;
}) {
  const { t } = useTranslation("shell");
  const { canCreate } = useCanCreateAgents();
  const workspaceId = useWorkspaceStore((store) => store.current?.id);
  const sidebar = useSidebarLayout(workspaceId);

  return (
    <PageContainer className="shrink-0 pt-6">
      <PageHero
        title={t("agentsHome.title")}
        className="mb-3"
        trailing={
          <div className="flex items-center gap-2">
            <NewGroupButton
              label={t("sidebar.newTeam")}
              disabled={!sidebar.ready}
            />
            {canCreate && <NewAgentButton label={t("sidebar.addAgent")} />}
          </div>
        }
      />
      {agentHomeHasTeamFilter(teams) && (
        <div className="mb-2 flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <AgentsHomeTeamFilter
              teams={teams}
              selected={selected}
              onSelect={onSelect}
            />
          </div>
          {selected && (
            <TeamFolderMenu
              team={selected}
              onDelete={() => onSelect(null)}
              triggerClassName="mr-0 size-9 rounded-full bg-chip text-ink ht-hairline md:hidden"
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}

/** Opens the group create form in its small dialog; the list stays behind. */
function NewGroupButton({
  label,
  disabled,
}: {
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      data-testid="agents-home-new-group"
      onClick={() => useUIStore.getState().openCreateFlow("team")}
      className={`${chipButtonClasses} md:hidden`}
    >
      <FolderPlus className="size-5" />
    </button>
  );
}

/**
 * The phone's create-agent control. The desktop reaches the same dialog from
 * the rail's own `newAgent` anchor; the rail is not rendered below md, so this
 * carries the anchor there and the spotlight takes whichever is visible.
 */
function NewAgentButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid="agents-home-new-agent"
      {...tourAnchor("newAgent")}
      onClick={() => useUIStore.getState().openCreateFlow("agent")}
      className={chipButtonClasses}
    >
      <HoustonHelmet size={20} color="currentColor" />
    </button>
  );
}
