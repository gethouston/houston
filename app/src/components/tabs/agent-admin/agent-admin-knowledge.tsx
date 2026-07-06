import {
  useAddLearning,
  useLearnings,
  useRemoveLearning,
  useUpdateLearning,
} from "../../../hooks/queries";
import { LearningsContent } from "../learnings-content";
import {
  type AgentAdminScreenProps,
  AgentAdminScreenShell,
} from "./agent-admin-back-bar";

/** Knowledge (learnings) drill-in. Always editable (managers/owners only). */
export function AgentAdminKnowledge({ agent, onBack }: AgentAdminScreenProps) {
  const path = agent.folderPath;
  const { data } = useLearnings(path);
  const addLearning = useAddLearning(path);
  const removeLearning = useRemoveLearning(path);
  const updateLearning = useUpdateLearning(path);
  return (
    <AgentAdminScreenShell onBack={onBack}>
      <LearningsContent
        entries={data?.entries ?? []}
        onAdd={(text) => addLearning.mutateAsync(text)}
        onRemove={(index) => removeLearning.mutateAsync(index)}
        onUpdate={(id, text) => updateLearning.mutateAsync({ id, text })}
      />
    </AgentAdminScreenShell>
  );
}
