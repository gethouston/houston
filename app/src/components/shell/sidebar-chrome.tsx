import type { SidebarLabels } from "@houston-ai/layout";
import { WorkspaceSwitcher } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasSpaces } from "../../lib/org-roles";
import { CreateOrganizationDialog } from "./create-organization-dialog";
import { tourAnchor } from "./workspace-tour-steps.ts";

/** The namespaces every builder and component in the rail's chrome reads from. */
export type SidebarChromeT = TFunction<["shell", "common", "teams"]>;

/** Labels for the rail and its visible agent creation row. */
export function buildSidebarLabels(t: SidebarChromeT): SidebarLabels {
  return {
    addItem: t("shell:sidebar.addAgent"),
    collapseSidebar: t("shell:sidebar.collapse"),
    expandSidebar: t("shell:sidebar.expand"),
    dragPickedUp: t("shell:sidebar.drag.pickedUp"),
    dragMovedOver: t("shell:sidebar.drag.movedOver"),
    dragDropped: t("shell:sidebar.drag.dropped"),
    dragCancelled: t("shell:sidebar.drag.cancelled"),
    dragInstructions: t("shell:sidebar.drag.instructions"),
    dragKeyboardMoved: t("shell:sidebar.drag.keyboardMoved"),
    dragKeyboardMovedInGroup: t("shell:sidebar.drag.keyboardMovedInGroup"),
    dragKeyboardEnteredGroup: t("shell:sidebar.drag.keyboardEnteredGroup"),
    dragKeyboardLeftGroup: t("shell:sidebar.drag.keyboardLeftGroup"),
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
