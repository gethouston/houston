import {
  useAddLearning,
  useLearnings,
  useRemoveLearning,
  useUpdateLearning,
} from "../../../hooks/queries";
import { LearningsContent } from "../learnings-content";
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";

/** Knowledge (learnings) section. Always editable (managers/owners only). */
export function AgentAdminKnowledge({ agent }: AgentAdminScreenProps) {
  const path = agent.folderPath;
  const { data } = useLearnings(path);
  const addLearning = useAddLearning(path);
  const removeLearning = useRemoveLearning(path);
  const updateLearning = useUpdateLearning(path);
  return (
    <LearningsContent
      entries={data?.entries ?? []}
      onAdd={(text) => addLearning.mutateAsync(text)}
      onRemove={(index) => removeLearning.mutateAsync(index)}
      onUpdate={(id, text) => updateLearning.mutateAsync({ id, text })}
    />
  );
}
