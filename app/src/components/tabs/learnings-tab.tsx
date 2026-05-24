import { useTranslation } from "react-i18next";
import type { TabProps } from "../../lib/types";
import {
  useAddLearning,
  useLearnings,
  useRemoveLearning,
  useUpdateLearning,
} from "../../hooks/queries";
import { LearningsContent } from "./learnings-content";

export default function LearningsTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const path = agent.folderPath;
  const { data: learningsData } = useLearnings(path);
  const addLearning = useAddLearning(path);
  const removeLearning = useRemoveLearning(path);
  const updateLearning = useUpdateLearning(path);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h2 className="text-sm font-medium text-foreground">
          {t("configure.learnings.title")}
        </h2>
        <p className="text-xs text-muted-foreground/60 mt-0.5 mb-3">
          {t("configure.learnings.description")}
        </p>
        <LearningsContent
          entries={learningsData?.entries ?? []}
          onAdd={(txt) => addLearning.mutateAsync(txt)}
          onRemove={(i) => removeLearning.mutateAsync(i)}
          onUpdate={(id, text) => updateLearning.mutateAsync({ id, text })}
          layout="section"
        />
      </div>
    </div>
  );
}
