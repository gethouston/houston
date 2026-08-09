import { useMemo } from "react";
import {
  useActivity,
  useAddLearning,
  useLearnings,
  useRemoveLearning,
  useUpdateLearning,
} from "../../../hooks/queries";
import { useUserProfiles } from "../../../hooks/queries/use-user-profiles";
import {
  collectTaughtByIds,
  resolveLearningProvenance,
} from "../../../lib/learning-provenance";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { LearningsContent } from "../learnings-content";

/** Memory (learnings) section. Read-only for non-managers. */
export function AgentAdminKnowledge({
  agent,
  readOnly = false,
}: AgentSectionProps) {
  const path = agent.folderPath;
  const { data } = useLearnings(path);
  const addLearning = useAddLearning(path);
  const removeLearning = useRemoveLearning(path);
  const updateLearning = useUpdateLearning(path);

  const entries = data?.entries ?? [];
  // Faces for whoever taught these learnings. The hook is multiplayer-gated, so
  // single player / desktop resolves nothing and the line falls back to the name
  // stored on the learning itself.
  const { profiles } = useUserProfiles(collectTaughtByIds(entries));
  // Live mission titles, so a renamed mission reads correctly; the title stored
  // at save time covers a mission that was since deleted.
  const { data: activities } = useActivity(path);
  const missionTitles = useMemo(
    () => new Map((activities ?? []).map((a) => [a.id, a.title])),
    [activities],
  );

  // The card takes the RESOLVED line only; the raw provenance fields stop here.
  const rows = useMemo(
    () =>
      entries.map(({ index, text, id, ...source }) => ({
        index,
        text,
        id,
        provenance: resolveLearningProvenance(source, profiles, missionTitles),
      })),
    [entries, profiles, missionTitles],
  );

  return (
    <LearningsContent
      entries={rows}
      readOnly={readOnly}
      onAdd={(text) => addLearning.mutateAsync(text)}
      onRemove={(index) => removeLearning.mutateAsync(index)}
      onUpdate={(id, text) => updateLearning.mutateAsync({ id, text })}
    />
  );
}
