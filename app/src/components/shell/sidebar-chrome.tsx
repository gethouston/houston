import type { SidebarLabels } from "@houston-ai/layout";
import { WorkspaceSwitcher } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasSpaces } from "../../lib/org-roles";
import { CreateTeamDialog } from "./create-team-dialog";
import { tourAnchor } from "./workspace-tour-steps.ts";

/**
 * The namespaces every builder and component in the rail's chrome reads from.
 * `dashboard` is here for one string: the Inbox row's unread-mention count,
 * whose copy belongs to the mentions surface that also feeds the header bell.
 * `settings` is here for two: the Admin and Permissions rows keep the names the
 * Settings index already owned for those screens rather than growing a second
 * pair of strings for the same two destinations.
 */
export type SidebarChromeT = TFunction<
  ["shell", "common", "teams", "dashboard", "settings"]
>;

/**
 * Localized `AppSidebar` labels (team actions, and the words the list itself
 * uses). An agent row has no actions to name any more: it is renamed,
 * recoloured, moved and deleted on its team's Manage agents page. The
 * trailing block is named after the workspace and passed as `defaultGroup`, so
 * there is no anonymous "ungrouped" header to label — the library dropped that
 * branch and its untranslated string with it.
 */
export function buildSidebarLabels(t: SidebarChromeT): SidebarLabels {
  return {
    addItem: t("shell:sidebar.addAgent"),
    collapseSidebar: t("shell:sidebar.collapse"),
    createGroup: t("shell:sidebar.newTeam"),
    editGroup: t("shell:sidebar.teams.identity"),
    deleteGroup: t("shell:sidebar.teams.delete"),
    // Only ever rendered for a team whose `affordances.leave` is explicitly
    // true, which is a server-teams host talking about a team you joined.
    leaveGroup: t("shell:sidebar.teams.leave"),
    groupMenu: t("shell:sidebar.teams.menu"),
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
  t: SidebarChromeT;
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
