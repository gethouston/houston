import { useTranslation } from "react-i18next";
import {
  useSaveWorkspaceContext,
  useWorkspaceContext,
} from "../../../hooks/queries/use-workspace-context";
import { useAgentStore } from "../../../stores/agents";
import {
  InstructionsContent,
  type InstructionsContentLabels,
} from "../../tabs/job-description-parts";

type Slot = "workspace" | "user";

function useSlotEditor(slot: Slot) {
  // Stored on the open agent (see use-workspace-context): the files live at its
  // workspace root and its runtime reads them into the prompt.
  const agentPath = useAgentStore((s) => s.current?.folderPath);
  const { data } = useWorkspaceContext(agentPath);
  const save = useSaveWorkspaceContext(agentPath);

  const content = data?.[slot] ?? "";

  const onSave = async (next: string) => {
    await save.mutateAsync({ slot, content: next });
  };

  return { ready: !!agentPath && !!data, content, onSave };
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
