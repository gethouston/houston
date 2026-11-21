import { useCapabilities } from "../../hooks/use-capabilities";
import type { Agent, SkillSummary } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaces";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./skill-editor-props";
import { useSharedSkills } from "./use-shared-skills";
import { useSharedSkillsActions } from "./use-shared-skills-actions";
import { useWorkspaceSkills } from "./use-workspace-skills";

export interface SkillsModels {
  rows: ManagedSkillRow[];
  listsByPath: Map<string, SkillSummary[] | undefined>;
  loading: boolean;
  complete: boolean;
  failed: boolean;
  retry: () => void;
  shared: SharedDialogActions | undefined;
}

export function useSkillsModels(agents: Agent[]): SkillsModels {
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const { capabilities } = useCapabilities();
  const sharedMode =
    capabilities?.sharedSkills === true && workspaceId !== null;
  const copyModel = useWorkspaceSkills(agents);
  const sharedModel = useSharedSkills({
    enabled: sharedMode,
    workspaceId,
    agents,
    listsByPath: copyModel.listsByPath,
  });
  const sharedActions = useSharedSkillsActions(workspaceId);

  const shared: SharedDialogActions | undefined =
    sharedMode && workspaceId !== null
      ? {
          workspaceId,
          onApply: sharedActions.applyShared,
          onDelete: (row) => sharedActions.deleteShared(row, agents),
          onRevert: sharedActions.revertOverride,
          onDisableForAgent: sharedActions.disableForAgent,
          onEnableAll: (row) => sharedActions.enableForAll(row, agents),
          onAddToAgent: sharedActions.addToAgent,
          onPromote: sharedActions.promoteToShared,
        }
      : undefined;

  return {
    rows: sharedMode ? sharedModel.rows : copyModel.rows,
    listsByPath: copyModel.listsByPath,
    loading: sharedMode
      ? copyModel.loading || sharedModel.loading
      : copyModel.loading,
    complete: copyModel.complete && sharedModel.complete,
    failed: sharedMode
      ? copyModel.failed || sharedModel.failed
      : copyModel.failed,
    retry: () => {
      copyModel.retry();
      if (sharedMode) sharedModel.retry();
    },
    shared,
  };
}
