import { FlowSheet } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { AgentContextId } from "../../lib/agent-role-catalog";
import type { JobBriefField } from "./job-brief-model";
import { JobBriefQuestion } from "./job-brief-question";

/**
 * The industry / role question, asked again after creation from the Job
 * description tab: {@link JobBriefQuestion} in the create sheet's own frame.
 *
 * Mounted only while open (the rows own that), so it always opens on what the
 * file holds now, including a change the agent itself just made.
 */
export function JobBriefPicker({
  field,
  current,
  industryId,
  onClose,
  onPick,
}: {
  field: JobBriefField;
  /** The answer in the file, as the user reads it. */
  current: string | null;
  /** The saved industry's catalog id, so the role runs lead with its own jobs. */
  industryId: AgentContextId | null;
  onClose: () => void;
  onPick: (answer: string) => void;
}) {
  const { t } = useTranslation(["agentOnboarding", "common"]);

  return (
    <FlowSheet
      open
      onOpenChange={(next) => !next && onClose()}
      // A catalog of a hundred and eighty chips is scanning work, so it takes
      // the wide frame — the same one the create sheet asks this question in.
      size="wide"
      // The frame is NAMED for the answer being changed, and nothing draws
      // that name: the question itself is the step's own heading, exactly as
      // it reads inside the create sheet.
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
