import { useTranslation } from "react-i18next";
import {
  useSaveWorkspaceContext,
  useWorkspaceContext,
} from "../../hooks/queries/use-workspace-context";
import { useAgentStore } from "../../stores/agents";
import type { InstructionsContentLabels } from "../agent/job-description-parts";

/** The two halves of the workspace's standing context, as stored on the wire. */
export type ContextSlot = "workspace" | "user";

/**
 * One context slot's editor state: the content, the save, and whether the
 * agent-backed read has landed.
 *
 * Both files live at the OPEN AGENT's workspace root and its runtime reads them
 * into the prompt (see `use-workspace-context`), which is why an agent path is
 * the precondition rather than a workspace id. `ready` is false until one
 * resolves, so the surface can show a frame instead of an editor over nothing.
 */
export function useContextSlot(slot: ContextSlot): {
  ready: boolean;
  content: string;
  onSave: (next: string) => Promise<void>;
} {
  const agentPath = useAgentStore((s) => s.current?.folderPath);
  const { data } = useWorkspaceContext(agentPath);
  const save = useSaveWorkspaceContext(agentPath);

  return {
    ready: !!agentPath && !!data,
    content: data?.[slot] ?? "",
    onSave: async (next: string) => {
      await save.mutateAsync({ slot, content: next });
    },
  };
}

/** The editor copy for one slot, in the shared `InstructionsContent` shape. */
export function useContextSlotLabels(
  slot: ContextSlot,
): InstructionsContentLabels {
  const { t } = useTranslation("context");
  return {
    emptyTitle: t(`editor.${slot}.emptyTitle`),
    emptyDescription: t(`editor.${slot}.emptyDescription`),
    writeButton: t(`editor.${slot}.writeButton`),
    helper: t(`editor.${slot}.helper`),
    saving: t("editor.saving"),
    saved: t("editor.saved"),
    placeholder: t(`editor.${slot}.placeholder`),
  };
}
