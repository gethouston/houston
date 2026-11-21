import { FlowSheet } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { AgentContextId } from "../../lib/agent-role-catalog";
import type { JobBriefField } from "./job-brief-model";
import { JobBriefQuestion } from "./job-brief-question";

export function JobBriefPicker({
  field,
  current,
  industryId,
  onClose,
  onPick,
}: {
  field: JobBriefField;
  current: string | null;
  industryId: AgentContextId | null;
  onClose: () => void;
  onPick: (answer: string) => void;
}) {
  const { t } = useTranslation(["agentOnboarding", "common"]);

  return (
    <FlowSheet
      open
      onOpenChange={(next) => !next && onClose()}
      size="wide"
      title={t(
        field === "industry"
          ? "agentOnboarding:roleSetup.steps.context"
          : "agentOnboarding:roleSetup.steps.role",
      )}
      labels={{ close: t("common:actions.close") }}
    >
      <JobBriefQuestion
        field={field}
        current={current}
        industryId={industryId}
        onAnswer={(answer) => {
          onPick(answer);
          onClose();
        }}
      />
    </FlowSheet>
  );
}
