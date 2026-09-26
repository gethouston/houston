import { CreateWorkspaceDialog } from "./workspace-dialog";

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
