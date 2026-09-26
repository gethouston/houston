import {
  ConfirmDialog,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import {
  Building2,
  MoreHorizontal,
  Palette,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrgs } from "../../hooks/queries/use-spaces";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import { canMoveFolderToSpace } from "../../lib/team-move-eligibility";
import type { TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { EditTeamIdentityDialog } from "./edit-team-identity-dialog";

export function TeamFolderMenu({
  team,
  onDelete,
  triggerClassName,
}: {
  team: TeamView;
  /** Runs after the group is deleted, for a caller standing on it. */
  onDelete?: () => void;
  /** Restyles the trigger for a host outside the rail. */
  triggerClassName?: string;
}) {
  const { t } = useTranslation(["shell", "teams"]);
  const workspaceId = useWorkspaceStore((store) => store.current?.id);
  const sidebar = useSidebarLayout(workspaceId);
  const personalSpace = usePersonalSpace();
  const { capabilities } = useCapabilities();
  const [edit, setEdit] = useState<"rename" | "identity" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openTeamMove = useUIStore((store) => store.openTeamMove);
  const orgs = useOrgs(personalSpace && capabilities?.spaces === true);
  const canMove = Boolean(
    workspaceId &&
      canMoveFolderToSpace(
        personalSpace,
        capabilities,
        team.agents,
        orgs.data?.orgs ?? [],
      ),
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("shell:sidebar.teams.menu", { name: team.name })}
            data-testid="team-folder-menu"
            disabled={!sidebar.ready}
            className={cn(
              sidebarRowAffordanceClasses,
              "size-10 md:size-6",
              triggerClassName,
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => setEdit("rename")}>
            <Pencil className="size-4" />
            {t("shell:sidebar.teams.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEdit("identity")}>
            <Palette className="size-4" />
            {t("shell:sidebar.teams.identity")}
          </DropdownMenuItem>
          {canMove && (
            <DropdownMenuItem
              onSelect={() =>
                openTeamMove({
                  id: team.id,
                  workspaceId: workspaceId as string,
                  name: team.name,
                  ...(team.icon ? { icon: team.icon } : {}),
                  ...(team.color ? { color: team.color } : {}),
                  agents: team.agents.map((agent) => ({
                    id: agent.id,
                    name: agent.name,
                  })),
                })
              }
            >
              <Building2 className="size-4" />
              {t("shell:sidebar.teams.move")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            {t("shell:sidebar.teams.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("teams:groupDelete.title", { name: team.name })}
        description={t("teams:groupDelete.description")}
        confirmLabel={t("teams:groupDelete.confirm")}
        cancelLabel={t("teams:groupDelete.cancel")}
        variant="destructive"
        onConfirm={() => {
          sidebar.deleteGroup(team.id);
          onDelete?.();
        }}
      />
      {edit && (
        <EditTeamIdentityDialog
          team={team}
          mode={edit}
          onClose={() => setEdit(null)}
          renameGroup={sidebar.renameGroup}
          setIdentity={sidebar.setGroupIdentity}
        />
      )}
    </>
  );
}
