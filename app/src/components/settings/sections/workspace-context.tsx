import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../../stores/workspaces";
import {
  useSaveWorkspaceContext,
  useWorkspaceContext,
} from "../../../hooks/queries/use-workspace-context";
import {
  InstructionsContent,
  type InstructionsContentLabels,
} from "../../tabs/job-description-parts";

type Slot = "workspace" | "user";

function useSlotEditor(slot: Slot) {
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const { data } = useWorkspaceContext(currentWorkspace?.id);
  const save = useSaveWorkspaceContext(currentWorkspace?.id);

  const content = data?.[slot] ?? "";

  const onSave = async (next: string) => {
    if (!data) return;
    await save.mutateAsync({ ...data, [slot]: next });
  };

  return { ready: !!currentWorkspace && !!data, content, onSave };
}

function useSlotLabels(
  prefix: "workspaceContext" | "userContext",
): InstructionsContentLabels {
  const { t } = useTranslation("settings");
  return {
    emptyTitle: t(`${prefix}.emptyTitle`),
    emptyDescription: t(`${prefix}.emptyDescription`),
    writeButton: t(`${prefix}.writeButton`),
    helper: t(`${prefix}.helper`),
    saving: t(`${prefix}.saving`),
    saved: t(`${prefix}.saved`),
    placeholder: t(`${prefix}.placeholder`),
  };
}

export function WorkspaceContextSection() {
  const editor = useSlotEditor("workspace");
  const labels = useSlotLabels("workspaceContext");
  if (!editor.ready) return null;
  return (
    <InstructionsContent
      content={editor.content}
      onSave={editor.onSave}
      labels={labels}
    />
  );
}

export function UserContextSection() {
  const editor = useSlotEditor("user");
  const labels = useSlotLabels("userContext");
  if (!editor.ready) return null;
  return (
    <InstructionsContent
      content={editor.content}
      onSave={editor.onSave}
      labels={labels}
    />
  );
}
