import { ConfirmDialog } from "@houston-ai/core";
import type { SidebarLayout } from "@houston-ai/engine-client";
import type { TFunction } from "i18next";
import { GroupContextDialog } from "./group-context-dialog";
import { CreateWorkspaceDialog } from "./workspace-dialog";

/** Only `shell:` and `common:` keys are read here. */
type SidebarDialogsT = TFunction<["shell", "common"]>;

/**
 * The three dialogs the sidebar owns: confirming an agent delete, creating a
 * workspace, and editing a team's shared context. They are siblings of the rail
 * rather than part of it — each is opened from a different corner of it, and
 * none of them belongs to its layout — so they render as one block here and the
 * rail keeps only the state that opens them.
 */
export function SidebarDialogs(props: {
  t: SidebarDialogsT;
  /** The agent awaiting delete confirmation (null = no dialog). */
  pendingDeleteId: string | null;
  onPendingDeleteIdChange: (agentId: string | null) => void;
  onDeleteAgent: (agentId: string) => Promise<void>;
  createWorkspaceOpen: boolean;
  onCreateWorkspaceOpenChange: (open: boolean) => void;
  /** The group whose shared context is open in the editor (null = closed). */
  editingContextGroupId: string | null;
  onEditingContextGroupIdChange: (groupId: string | null) => void;
  /** The stored layout's groups — where the edited group's name and current
   *  context are read from. */
  groups: SidebarLayout["groups"];
  onSaveGroupContext: (groupId: string, context: string) => void;
}) {
  const { t, pendingDeleteId, editingContextGroupId } = props;

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    await props.onDeleteAgent(pendingDeleteId);
    props.onPendingDeleteIdChange(null);
  };

  const editingContextGroup = editingContextGroupId
    ? props.groups.find((g) => g.id === editingContextGroupId)
    : undefined;

  return (
    <>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) props.onPendingDeleteIdChange(null);
        }}
        title={t("shell:agentDelete.title")}
        description={t("shell:agentDelete.description")}
        confirmLabel={t("common:actions.delete")}
        onConfirm={confirmDelete}
      />
      <CreateWorkspaceDialog
        open={props.createWorkspaceOpen}
        onOpenChange={props.onCreateWorkspaceOpenChange}
      />
      <GroupContextDialog
        open={editingContextGroup !== undefined}
        onOpenChange={(open) => {
          if (!open) props.onEditingContextGroupIdChange(null);
        }}
        groupName={editingContextGroup?.name ?? ""}
        content={editingContextGroup?.context ?? ""}
        onSave={(next) => {
          if (editingContextGroupId)
            props.onSaveGroupContext(editingContextGroupId, next);
        }}
      />
    </>
  );
}
