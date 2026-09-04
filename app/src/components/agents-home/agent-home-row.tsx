import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../organization/org-time";
import { NeedsYouChip } from "../shell/agent-sidebar-status";
import { AgentAvatarStack } from "./agent-avatar-stack";
import type { AgentHomeRow } from "./agents-home-model";

/**
 * One agent in the phone's Agents home, in the grammar of a messaging app's
 * chat list: a large avatar on the left (fanned into a stack when the agent
 * holds several conversations), the agent's name beside it with the time of
 * its latest movement trailing, and under the name the preview line — the
 * title of the agent's most recently moved task, or "No tasks yet" — with the
 * needs-you count as the row's badge.
 *
 * The preview is the latest TASK, not a message: an agent is a thread of
 * many conversations, and the one line a row has room for is the thing that
 * moved last. The divider between rows is inset past the avatar, the way a
 * chat list draws it, so the avatars read as one column.
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
      className="flex w-full items-center gap-3 pl-4 pr-0 text-left transition-colors hover:bg-hover active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    >
      <AgentAvatarStack
        color={row.agent.color}
        running={row.runningCount > 0}
        stacked={row.taskCount > 1}
      />
      <span className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-center gap-0.5 border-b border-line pr-4 group-last:border-b-0">
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
          <span
            data-testid="agents-home-row-preview"
            className="min-w-0 flex-1 truncate text-sm text-ink-muted"
          >
            {row.latestTitle ?? t("agentsHome.noTasks")}
          </span>
          <NeedsYouChip
            count={row.needsYouCount}
            label={t("sidebar.needsYouCount", { count: row.needsYouCount })}
          />
        </span>
      </span>
    </button>
  );
}
