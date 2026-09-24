import type { SidebarLabels } from "@houston-ai/layout";
import { WorkspaceSwitcher } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasSpaces } from "../../lib/org-roles";
import { CreateOrganizationDialog } from "./create-organization-dialog";
import { tourAnchor } from "./workspace-tour-steps.ts";

/**
 * The namespaces every builder and component in the rail's chrome reads from.
 * `settings` is here for one string: the Admin row keeps the name the Settings
 * index already owned for that screen rather than growing a second string for
 * the same destination.
 */
export type SidebarChromeT = TFunction<
  ["shell", "common", "teams", "settings"]
>;

/**
 * Localized `AppSidebar` labels (team actions, and the words the list itself
 * uses). An agent row has no actions to name any more: it is renamed,
 * recoloured, moved and deleted on its focused agent screen. The
 * trailing block is named after the workspace and passed as `defaultGroup`, so
 * there is no anonymous "ungrouped" header to label — the library dropped that
 * branch and its untranslated string with it.
 */
export function buildSidebarLabels(t: SidebarChromeT): SidebarLabels {
  return {
    addItem: t("shell:sidebar.addAgent"),
    collapseSidebar: t("shell:sidebar.collapse"),
    expandSidebar: t("shell:sidebar.expand"),
  };
}

/**
 * The workspace switcher header, with its labels wired through `t()`.
 *
 * The create action routes on `capabilities.spaces` (C8): on a hosted
 * deployment that serves Spaces it opens the create-organization dialog and
 * reads "Create organization"; otherwise it falls back to the caller's
 * `onCreate` (the local workspace-create dialog) and reads the truthful
 * "Create workspace" label.
 *
 * Pending invitations addressed to the caller render directly BELOW this
 * header, in the sidebar's `headerBelow` band (`SidebarInviteInbox`,
 * `pending-invites.tsx`) — same place in the user's eye, but its own full-width
 * row, independent of the switcher and the window controls.
 */
export function SidebarWorkspaceHeader(props: {
  t: SidebarChromeT;
  workspaces: { id: string; name: string }[];
  currentId: string | null;
  currentName: string | undefined;
  collapsed: boolean;
  compactTop?: boolean;
  onSwitch: (workspaceId: string) => void;
  onCreate: () => void;
}) {
  const { t } = props;
  const { capabilities } = useCapabilities();
  const spacesEnabled = hasSpaces(capabilities);
  const [createOrganizationOpen, setCreateOrganizationOpen] = useState(false);
  return (
    <div {...tourAnchor("spaceSwitcher")}>
      <WorkspaceSwitcher
        workspaces={props.workspaces}
        currentId={props.currentId}
        currentName={props.currentName ?? t("shell:sidebar.selectWorkspace")}
        onSwitch={props.onSwitch}
        onCreate={
          spacesEnabled ? () => setCreateOrganizationOpen(true) : props.onCreate
        }
        collapsed={props.collapsed}
        compactTop={props.compactTop}
        createLabel={
          spacesEnabled
            ? t("teams:createTeam.trigger")
            : t("shell:sidebar.createWorkspace")
        }
      />
      {spacesEnabled ? (
        <CreateOrganizationDialog
          open={createOrganizationOpen}
          onOpenChange={setCreateOrganizationOpen}
        />
      ) : null}
    </div>
  );
}
