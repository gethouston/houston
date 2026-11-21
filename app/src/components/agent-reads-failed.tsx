import { Button } from "@houston-ai/core";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentReadFailures } from "../lib/agent-read-failures";
import { ReportBugButton } from "./cards/report-bug-button";

export function AgentReadsFailed({
  failures,
  onRetry,
  retrying,
}: {
  failures: AgentReadFailures;
  onRetry: () => void;
  retrying: boolean;
}) {
  const { t } = useTranslation("shell");
  const { failed, total } = failures;
  if (failed.length === 0) return null;

  return (
    <div
      role="status"
      data-testid="agent-reads-failed"
      className="mt-3 flex items-start gap-3 rounded-xl bg-chip px-4 py-3"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {total === 1
            ? t("agentReads.failedOne", { name: failed[0].name })
            : t("agentReads.failed", { failed: failed.length, total })}
        </p>
        {total > 1 && (
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            {failed.map((a) => a.name).join(", ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <ReportBugButton
          command="agent_reads_failed"
          details={`Could not read ${failed.length} of ${total} agents: ${failed
            .map((a) => `${a.name} (${a.folderPath})`)
            .join(", ")}`}
          label={t("agentReads.report")}
        />
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={onRetry}
          disabled={retrying}
        >
          <RefreshCw className={retrying ? "size-4 animate-spin" : "size-4"} />
          {t("agentReads.retry")}
        </Button>
      </div>
    </div>
  );
}
