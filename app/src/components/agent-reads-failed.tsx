import { Button } from "@houston-ai/core";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentReadFailures } from "../lib/agent-read-failures";
import { ReportBugButton } from "./cards/report-bug-button";

/**
 * The ONE strip a surface shows when an agent's read did not answer — a team
 * section naming the members it could not reach, or a Files tree saying that
 * this agent's files failed to load rather than sitting there looking empty.
 *
 * It stays INSIDE the surface, above the content, rather than becoming a toast:
 * the fact is durable (those agents are still missing from what is on screen),
 * and a background refetch would otherwise fire one toast per unreachable agent
 * every time the window regained focus. Retry is the loud, user-initiated path
 * — it refetches only what failed, so a healthy fleet is never re-swept to fix
 * one pod.
 *
 * Beside it sits the standard Report-bug pill (`components/cards/`, the same
 * one the provider-error cards mount), because a durable visible failure with
 * no way to tell us about it is exactly what the no-silent-failures policy
 * forbids: quiet in the background, never a dead end once a person is looking
 * at it. The agents are named in its payload, since "which pods" is the whole
 * diagnosis.
 *
 * It carries NO horizontal inset of its own: the surfaces that render it keep
 * different gutters (a routines list, a files browser), and a strip whose left
 * edge does not land on the content's reads as a floating banner rather than as
 * a statement about what is under it. The caller pays the gutter.
 */
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
            : // `failed`, not `count`: naming it `count` would send i18next
              // looking for `failed_one` / `failed_other` plurals that do not
              // exist, and "N of M agents" is plural in every branch anyway.
              t("agentReads.failed", { failed: failed.length, total })}
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
