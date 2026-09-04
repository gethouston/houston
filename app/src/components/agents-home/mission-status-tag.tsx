import type { TaskRowStatus } from "@houston-ai/board";
import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * The little status label under a task row's preview, the way a business
 * chat list labels a thread ("Paying customer"): one word in a soft wash, so
 * the eye can read a task's state without a column or a band to place it in.
 *
 * Colour is SEMANTIC, never decoration: the two live states wear their status
 * tones (warning for a task waiting on the user, success for one running),
 * the settled ones wear the neutral chip.
 */
const TAG_CLASSES: Record<TaskRowStatus, string> = {
  needs_you: "bg-warning/15 text-warning",
  running: "bg-success/15 text-success",
  done: "bg-chip text-chip-text",
  archived: "bg-chip text-chip-text",
};

export function MissionStatusTag({ status }: { status: TaskRowStatus }) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const labels: Record<TaskRowStatus, string> = {
    needs_you: t("dashboard:columns.needsYou"),
    running: t("dashboard:columns.running"),
    done: t("dashboard:columns.done"),
    archived: t("shell:taskList.archived"),
  };
  return (
    <span
      data-testid="agent-mission-status"
      data-status={status}
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-[11px] font-weight-510 leading-none",
        TAG_CLASSES[status],
      )}
    >
      {labels[status]}
    </span>
  );
}
