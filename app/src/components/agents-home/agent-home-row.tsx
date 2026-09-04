import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../organization/org-time";
import { NeedsYouChip } from "../shell/agent-sidebar-status";
import { AgentAvatarStack } from "./agent-avatar-stack";
import { type AgentHomeRow, agentHomePreview } from "./agents-home-model";

/**
 * One agent in the phone's Agents home, in the grammar of a messaging app's
 * chat list: a large avatar on the left (fanned into a stack when the agent
 * holds several conversations), the agent's name beside it with the time of
 * its latest movement trailing, and under the name the preview line — the
 * title of the agent's most recently moved task, "Typing" while the agent has
 * a task running, or "No tasks yet" — with the needs-you count as the row's
 * badge.
 *
 * The preview is the latest TASK, not a message: an agent is a thread of
 * many conversations, and the one line a row has room for is the thing that
 * moved last. The divider between rows is the LIST's (one hairline per row,
 * inset the same distance from both screen edges), so this cell draws none.
 */
export function AgentHomeRowCell({
  row,
  onOpen,
}: {
  row: AgentHomeRow;
  onOpen: (row: AgentHomeRow) => void;
}) {
  const { t, i18n } = useTranslation("shell");
  return (
    <button
      type="button"
      data-testid="agents-home-row"
      onClick={() => onOpen(row)}
      className="flex w-full items-center gap-3 text-left transition-colors hover:bg-hover active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    >
      <AgentAvatarStack
        color={row.agent.color}
        running={row.runningCount > 0}
        stacked={row.taskCount > 1}
      />
      <span className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-base font-weight-510 text-ink">
            {row.agent.name}
          </span>
          {row.lastAt !== null && (
            // data-relative-time: a live clock the visual suite masks.
            <span
              data-relative-time
              className="shrink-0 text-xs text-ink-muted tabular-nums"
            >
              {formatRelativeTime(row.lastAt, i18n.language)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <PreviewLine row={row} />
          <NeedsYouChip
            count={row.needsYouCount}
            label={t("sidebar.needsYouCount", { count: row.needsYouCount })}
          />
        </span>
      </span>
    </button>
  );
}

/** The preview line, by {@link agentHomePreview}. "Typing" wears the success
 *  tone: it is the one live state the row has, and the ring on the avatar
 *  already says the same thing in colour. */
function PreviewLine({ row }: { row: AgentHomeRow }) {
  const { t } = useTranslation("shell");
  const preview = agentHomePreview(row);
  return (
    <span
      data-testid="agents-home-row-preview"
      data-preview={preview.kind}
      className={cn(
        "min-w-0 flex-1 truncate text-sm",
        preview.kind === "typing"
          ? "font-weight-510 text-success"
          : "text-ink-muted",
      )}
    >
      {preview.kind === "typing"
        ? t("agentsHome.typing")
        : preview.kind === "latest"
          ? preview.title
          : t("agentsHome.noTasks")}
    </span>
  );
}
