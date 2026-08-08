import type { SidebarLabels, SidebarNavItemEntry } from "@houston-ai/layout";
import { WorkspaceSwitcher } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import {
  Blocks,
  Boxes,
  LayoutDashboard,
  LibraryBig,
  Settings,
  Store,
} from "lucide-react";
import { useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasSpaces } from "../../lib/org-roles";
import type { TeamSectionId } from "../../lib/teams-model";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view";
import { SKILLS_VIEW_ID } from "../skills-view/id";
import { STORE_VIEW_ID } from "../store-view";
import { CreateTeamDialog } from "./create-team-dialog";
import { tourAnchor } from "./workspace-tour-steps.ts";

type ShellT = TFunction<["shell", "common", "teams"]>;

/**
 * The top-level navigation entries: Mission Control, Integrations, AI Models
 * (Teams-gated), Agent Store, Settings. Usage, Permissions and Admin are NOT
 * here since HOU-788 — they are sections inside Settings.
 */
export function buildSidebarNavItems(args: {
  t: ShellT;
  showAiModels: boolean;
  setViewMode: (view: string) => void;
  /** Opens Settings on its INDEX — see `UIState.openSettings`. Never plain
   *  `setViewMode("settings")`: that would be a dead click while a section is
   *  open, leaving the user staring at the section they wanted to leave. */
  openSettingsIndex: () => void;
}): SidebarNavItemEntry[] {
  const { t, showAiModels, setViewMode, openSettingsIndex } = args;
  return [
    {
      id: "dashboard",
      label: t("shell:sidebar.missionControl"),
      icon: <LayoutDashboard className="h-4 w-4" />,
      onClick: () => setViewMode("dashboard"),
      dataAttrs: tourAnchor("nav-dashboard"),
    },
    {
      id: INTEGRATIONS_VIEW_ID,
      label: t("shell:sidebar.integrations"),
      icon: <Blocks className="h-4 w-4" />,
      onClick: () => setViewMode(INTEGRATIONS_VIEW_ID),
      dataAttrs: tourAnchor("nav-integrations"),
    },
    {
      id: SKILLS_VIEW_ID,
      label: t("shell:sidebar.skills"),
      icon: <LibraryBig className="h-4 w-4" />,
      onClick: () => setViewMode(SKILLS_VIEW_ID),
      dataAttrs: tourAnchor("nav-skills"),
    },
    ...(showAiModels
      ? [
          {
            id: "ai-hub",
            label: t("shell:sidebar.aiModels"),
            icon: <Boxes className="h-4 w-4" />,
            onClick: () => setViewMode("ai-hub"),
            dataAttrs: tourAnchor("nav-ai-hub"),
          },
        ]
      : []),
    {
      id: STORE_VIEW_ID,
      label: t("shell:sidebar.agentStore"),
      icon: <Store className="h-4 w-4" />,
      onClick: () => setViewMode(STORE_VIEW_ID),
      dataAttrs: tourAnchor("nav-agent-store"),
    },
    {
      id: "settings",
      label: t("shell:sidebar.settings"),
      icon: <Settings className="h-4 w-4" />,
      onClick: openSettingsIndex,
      dataAttrs: tourAnchor("nav-settings"),
    },
  ];
}

/**
 * Localized `AppSidebar` labels (agent row actions + team actions). The
 * trailing block is named after the workspace and passed as `defaultGroup`, so
 * there is no anonymous "ungrouped" header to label — the library dropped that
 * branch and its untranslated string with it.
 */
export function buildSidebarLabels(t: ShellT): SidebarLabels {
  return {
    addItem: t("shell:sidebar.addAgent"),
    moreOptions: t("shell:sidebar.agentMenu"),
    renameItem: t("common:actions.rename"),
    deleteItem: t("common:actions.delete"),
    collapseSidebar: t("shell:sidebar.collapse"),
    createGroup: t("shell:sidebar.newTeam"),
    renameGroup: t("shell:sidebar.teams.rename"),
    deleteGroup: t("shell:sidebar.teams.delete"),
    editGroupContext: t("shell:sidebar.teams.editContext"),
    groupMenu: t("shell:sidebar.teams.menu"),
    newGroupPlaceholder: t("shell:sidebar.teams.namePlaceholder"),
    emptyGroupHint: t("shell:sidebar.teams.emptyHint"),
  };
}

/**
 * The label for every team section, including the ones a given team does not
 * offer this caller (`visibleTeamSectionsForTeam` decides which get a row, per
 * team). Complete by construction, so a section that starts rendering never
 * ships without its translation.
 */
export function buildTeamSectionLabels(
  t: ShellT,
): Record<TeamSectionId, string> {
  return {
    "mission-control": t("shell:sidebar.teamSections.missionControl"),
    routines: t("shell:sidebar.teamSections.routines"),
    files: t("shell:sidebar.teamSections.files"),
    settings: t("shell:sidebar.teamSections.settings"),
  };
}

/**
 * The workspace switcher header, with its labels wired through `t()`.
 *
 * The create action routes on `capabilities.spaces` (C8): on a hosted
 * deployment that serves Spaces it opens the Create-team dialog and reads
 * "Create team"; otherwise it falls back to the caller's `onCreate` (the local
 * workspace-create dialog) and reads the truthful "Create workspace" label —
 * the old "createOrganization" copy was a known mislabel.
 *
 * Pending invitations addressed to the caller render directly BELOW this
 * header, in the sidebar's `headerBelow` band (`SidebarInviteInbox`,
 * `pending-invites.tsx`) — same place in the user's eye, but its own full-width
 * row: the header line is shared with the collapse toggle, which would both
 * squeeze the cards and drag the toggle down to the middle of them.
 */
export function SidebarWorkspaceHeader(props: {
  t: ShellT;
  workspaces: { id: string; name: string }[];
  currentId: string | null;
  currentName: string | undefined;
  collapsed: boolean;
  onSwitch: (workspaceId: string) => void;
  onCreate: () => void;
  onExpand: () => void;
}) {
  const { t } = props;
  const { capabilities } = useCapabilities();
  const spacesEnabled = hasSpaces(capabilities);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  return (
    <div {...tourAnchor("spaceSwitcher")}>
      <WorkspaceSwitcher
        workspaces={props.workspaces}
        currentId={props.currentId}
        currentName={props.currentName ?? t("shell:sidebar.selectWorkspace")}
        onSwitch={props.onSwitch}
        onCreate={
          spacesEnabled ? () => setCreateTeamOpen(true) : props.onCreate
        }
        collapsed={props.collapsed}
        createLabel={
          spacesEnabled
            ? t("teams:createTeam.trigger")
            : t("shell:sidebar.createWorkspace")
        }
        onExpand={props.onExpand}
        expandLabel={t("shell:sidebar.expand")}
      />
      {spacesEnabled ? (
        <CreateTeamDialog
          open={createTeamOpen}
          onOpenChange={setCreateTeamOpen}
        />
      ) : null}
    </div>
  );
}
