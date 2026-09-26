import { useEffect, useState } from "react";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import { logAndReportError } from "../../lib/error-report";
import { useWorkspaceStore } from "../../stores/workspaces";
import { submitNewGroup } from "./new-group-submit";
import { teamNameTooLong } from "./team-identity-save";

export function useCreateTeamForm({
  open,
  onDone,
}: {
  open: boolean;
  onDone: () => void;
}) {
  const currentWorkspace = useWorkspaceStore((store) => store.current);
  const sidebar = useSidebarLayout(currentWorkspace?.id);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>();
  const [color, setColor] = useState<string>();

  useEffect(() => {
    if (open) return;
    setName("");
    setIcon(undefined);
    setColor(undefined);
  }, [open]);

  const trimmed = name.trim();
  const tooLong = teamNameTooLong(name);
  const submit = () =>
    submitNewGroup(
      { name, icon, color },
      {
        createGroup: sidebar.createGroup,
        onCreated: onDone,
        report: logAndReportError,
      },
    );

  return {
    name,
    icon,
    color,
    canSubmit: trimmed.length > 0 && !tooLong,
    setName,
    setIcon,
    setColor,
    submit,
  };
}

export type CreateTeamForm = ReturnType<typeof useCreateTeamForm>;
