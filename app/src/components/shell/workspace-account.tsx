import { DropdownMenuCheckboxItem, DropdownMenuItem } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasSpaces } from "../../lib/org-roles";
import { useWorkspaceStore } from "../../stores/workspaces";
import { CreateOrganizationDialog } from "./create-organization-dialog";

function afterClose(run: () => void): () => void {
  return () => setTimeout(run, 0);
}

export function MenuItemRow(props: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <DropdownMenuItem
      onSelect={afterClose(props.onSelect)}
      {...props.dataAttrs}
    >
      {props.icon}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
    </DropdownMenuItem>
  );
}

export function useWorkspaceCreate(onCreateLocal: () => void): {
  label: string;
  onCreate: () => void;
  dialog: ReactNode;
} {
  const { t } = useTranslation(["shell", "teams"]);
  const { capabilities } = useCapabilities();
  const spacesEnabled = hasSpaces(capabilities);
  const [open, setOpen] = useState(false);
  return {
    label: spacesEnabled
      ? t("teams:createTeam.trigger")
      : t("shell:sidebar.createWorkspace"),
    onCreate: spacesEnabled ? () => setOpen(true) : onCreateLocal,
    dialog: spacesEnabled ? (
      <CreateOrganizationDialog open={open} onOpenChange={setOpen} />
    ) : null,
  };
}

export function WorkspaceSwitchItems(props: {
  onSwitch: (workspaceId: string) => void;
  createLabel: string;
  onCreate: () => void;
}) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentId = useWorkspaceStore((s) => s.current?.id ?? null);
  return (
    <>
      {workspaces.map((workspace) => (
        <DropdownMenuCheckboxItem
          key={workspace.id}
          checked={workspace.id === currentId}
          onSelect={afterClose(() => props.onSwitch(workspace.id))}
        >
          <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
        </DropdownMenuCheckboxItem>
      ))}
      <MenuItemRow
        icon={<Plus className="size-4" aria-hidden="true" />}
        label={props.createLabel}
        onSelect={props.onCreate}
      />
    </>
  );
}
