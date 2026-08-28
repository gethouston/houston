import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../organization/org-time";
import { AgentSidebarIcon, NeedsYouChip } from "../shell/agent-sidebar-status";
import type { AgentHomeRow } from "./agents-home-model";

/**
 * One agent on the mobile Agents home: a two-line chat-list cell in the flat
 * "plane" row language. Line one is the agent (the rail's own avatar-with-
 * running-ring treatment plus its needs-you chip, never a second badge shape);
 * line two previews the most recently moved mission, with the movement's
 * relative time flushed right. A phone-first surface, so the whole cell is one
 * ≥56px tap target and nothing on it waits for a hover.
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
      className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <AgentSidebarIcon
        color={row.agent.color}
        running={row.runningCount > 0}
        runningLabel={t("sidebar.runningCount", { count: row.runningCount })}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-weight-510 text-ink">
            {row.agent.name}
          </span>
          <NeedsYouChip
            count={row.needsYouCount}
            label={t("sidebar.needsYouCount", { count: row.needsYouCount })}
          />
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-muted">
          {row.lastTitle ?? t("agentsHome.noMissionsPreview")}
        </span>
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
    </button>
  );
}
