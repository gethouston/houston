import type { SidebarLabels, SidebarNavItemEntry } from "@houston-ai/layout";
import { WorkspaceSwitcher } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import {
  Blocks,
  Boxes,
  Building2,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasSpaces } from "../../lib/org-roles";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view";
import { ORGANIZATION_VIEW_ID } from "../organization";
import { CreateTeamDialog } from "./create-team-dialog";

type ShellT = TFunction<["shell", "common", "portable", "teams"]>;

/** The top-level navigation entries (Mission Control, Integrations, AI Models,
 *  optional Organization, Settings). */
export function buildSidebarNavItems(args: {
  t: ShellT;
  showOrganization: boolean;
  setViewMode: (view: string) => void;
}): SidebarNavItemEntry[] {
  const { t, showOrganization, setViewMode } = args;
  return [
    {
      id: "dashboard",
      label: t("shell:sidebar.missionControl"),
      icon: <LayoutDashboard className="h-4 w-4" />,
      onClick: () => setViewMode("dashboard"),
      dataAttrs: { "data-tour-target": "nav-dashboard" },
    },
    {
      id: INTEGRATIONS_VIEW_ID,
      label: t("shell:sidebar.integrations"),
      icon: <Blocks className="h-4 w-4" />,
      onClick: () => setViewMode(INTEGRATIONS_VIEW_ID),
      dataAttrs: { "data-tour-target": "nav-integrations" },
    },
    {
      id: "ai-hub",
      label: t("shell:sidebar.aiModels"),
      icon: <Boxes className="h-4 w-4" />,
      onClick: () => setViewMode("ai-hub"),
      dataAttrs: { "data-tour-target": "nav-ai-hub" },
    },
    ...(showOrganization
      ? [
          {
            id: ORGANIZATION_VIEW_ID,
            label: t("teams:org.nav"),
            icon: <Building2 className="h-4 w-4" />,
            onClick: () => setViewMode(ORGANIZATION_VIEW_ID),
            dataAttrs: { "data-tour-target": "nav-organization" },
          },
        ]
      : []),
    {
      id: "settings",
      label: t("shell:sidebar.settings"),
      icon: <Settings className="h-4 w-4" />,
      onClick: () => setViewMode("settings"),
      dataAttrs: { "data-tour-target": "nav-settings" },
    },
  ];
}

/** Localized `AppSidebar` labels (agent row actions + group actions). */
export function buildSidebarLabels(t: ShellT): SidebarLabels {
  return {
    addItem: t("shell:sidebar.addAgent"),
    moreOptions: t("shell:sidebar.agentMenu"),
    renameItem: t("common:actions.rename"),
    deleteItem: t("common:actions.delete"),
    collapseSidebar: t("shell:sidebar.collapse"),
    createGroup: t("shell:sidebar.groups.new"),
    renameGroup: t("shell:sidebar.groups.rename"),
    deleteGroup: t("shell:sidebar.groups.delete"),
    groupMenu: t("shell:sidebar.groups.menu"),
    newGroupPlaceholder: t("shell:sidebar.groups.namePlaceholder"),
    emptyGroupHint: t("shell:sidebar.groups.emptyHint"),
    ungroupedLabel: t("shell:sidebar.groups.ungrouped"),
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
    <>
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
    </>
  );
}
