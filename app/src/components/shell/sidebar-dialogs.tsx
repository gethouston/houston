import { CreateWorkspaceDialog } from "./workspace-dialog";

/**
 * The one dialog the sidebar still owns: creating a workspace. It is a sibling
 * of the rail rather than part of it — it is opened from a corner of it and
 * belongs to none of its layout — so it renders here and the rail keeps only
 * the state that opens it.
 *
 * Two dialogs LEFT this file. A team's shared context became the first card of
 * that team's Manage agents page (`team-view/team-context-card.tsx`), one door
 * on every backend instead of a rail dialog that only ever worked on one. And
 * the delete-agent confirmation went with the agent row's "..." menu: an agent
 * is renamed, recoloured, moved and deleted where it is configured, so the
 * confirmation belongs to that page too.
 */
export function SidebarDialogs(props: {
  createWorkspaceOpen: boolean;
  onCreateWorkspaceOpenChange: (open: boolean) => void;
}) {
  return (
    <CreateWorkspaceDialog
      open={props.createWorkspaceOpen}
      onOpenChange={props.onCreateWorkspaceOpenChange}
    />
  );
}
