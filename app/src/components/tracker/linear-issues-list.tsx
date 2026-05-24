import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import type { TrackerIssue } from "@houston-ai/engine-client";
import { osOpenUrl } from "../../lib/os-bridge";
import { useUIStore } from "../../stores/ui";

/**
 * Renders a list of Linear issues with state pills, identifier badges,
 * and an open-in-Linear action. Designed as a self-contained component
 * so it can be reused in:
 *   - Settings → Tracker section (today, showing first N as a teaser)
 *   - Agent-shell `linear` tab (future C14 chunk, showing all + filters)
 *
 * Per the ui/ library boundary, Linear-specific concepts stay in app/
 * — this component reads TrackerIssue (an engine-client wire type) and
 * renders Linear's WorkflowStateType color mapping; both would leak if
 * placed in @houston-ai/board.
 */

interface LinearIssuesListProps {
  issues: TrackerIssue[];
  /** Truncate to this many. Omit to show all. */
  limit?: number;
  /** Show an empty-state message when issues.length === 0. Default true. */
  showEmpty?: boolean;
}

export function LinearIssuesList({
  issues,
  limit,
  showEmpty = true,
}: LinearIssuesListProps) {
  const { t } = useTranslation("tracker");
  const addToast = useUIStore((s) => s.addToast);

  if (issues.length === 0 && showEmpty) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("linear.issues.empty")}
      </p>
    );
  }

  const visible = limit ? issues.slice(0, limit) : issues;
  const truncated = limit && issues.length > limit ? issues.length - limit : 0;

  async function handleOpen(issue: TrackerIssue) {
    if (!issue.url) return;
    try {
      await osOpenUrl(issue.url);
    } catch (e) {
      addToast({
        title: t("linear.issues.openFailed"),
        description: issue.url,
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-1.5">
      {visible.map((issue) => (
        <LinearIssueRow
          key={issue.providerId}
          issue={issue}
          onOpen={() => handleOpen(issue)}
        />
      ))}
      {truncated > 0 && (
        <p className="text-xs text-muted-foreground pt-1">
          {t("linear.issues.moreTruncated", { count: truncated })}
        </p>
      )}
    </div>
  );
}

interface LinearIssueRowProps {
  issue: TrackerIssue;
  onOpen: () => void;
}

function LinearIssueRow({ issue, onOpen }: LinearIssueRowProps) {
  const { t } = useTranslation("tracker");
  return (
    <div className="group/row flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-muted/40 transition-colors">
      <span className="font-mono text-[11px] text-muted-foreground shrink-0 tabular-nums">
        {issue.identifier}
      </span>
      <StatePill stateType={issue.stateType} state={issue.state} />
      <p className="text-sm text-foreground flex-1 truncate">{issue.title}</p>
      {issue.url && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("linear.issues.openInLinear")}
          className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface StatePillProps {
  stateType: TrackerIssue["stateType"];
  state: string;
}

/**
 * Color-coded pill for Linear's typed workflow state. The mapping matches
 * Linear's own UI conventions: gray for triage/backlog (not started),
 * blue for unstarted (planned), yellow for started (in progress), green
 * for completed, red/strikethrough-y for canceled.
 *
 * `state` (the provider-native string) is the visible label; `stateType`
 * (the typed enum) drives the color. Workspaces can rename states in
 * Linear without breaking color coding.
 */
function StatePill({ stateType, state }: StatePillProps) {
  const classes = stateTypeClasses(stateType);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${classes}`}
    >
      {state}
    </span>
  );
}

function stateTypeClasses(stateType: TrackerIssue["stateType"]): string {
  switch (stateType) {
    case "triage":
    case "backlog":
      return "bg-muted text-muted-foreground";
    case "unstarted":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "started":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
    case "completed":
      return "bg-green-500/10 text-green-700 dark:text-green-300";
    case "canceled":
      return "bg-red-500/10 text-red-700 dark:text-red-300 line-through";
    default:
      return "bg-muted text-muted-foreground";
  }
}
