import { useTranslation } from "react-i18next";
import { AgentSidebarIcon, NeedsYouChip } from "../shell/agent-sidebar-status";
import type { AgentHomeRow } from "./agents-home-model";

/**
 * One agent in the phone's Agents tree: a single line — the rail's own
 * avatar-with-running-ring, the name, and the needs-you chip.
 *
 * ONE line, deliberately. The tree groups agents under their team, so the row
 * only has to identify an agent and say whether it is waiting on the user; a
 * preview of the agent's latest task would repeat, one tap early, the list
 * this row opens.
 */
export function AgentHomeRowCell({
  row,
  onOpen,
}: {
  row: AgentHomeRow;
  onOpen: (row: AgentHomeRow) => void;
}) {
  const { t } = useTranslation("shell");
  return (
    <button
      type="button"
      data-testid="agents-home-row"
      onClick={() => onOpen(row)}
      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <AgentSidebarIcon
        color={row.agent.color}
        running={row.runningCount > 0}
        runningLabel={t("sidebar.runningCount", { count: row.runningCount })}
      />
      <span className="min-w-0 flex-1 truncate text-base text-ink">
        {row.agent.name}
      </span>
      <NeedsYouChip
        count={row.needsYouCount}
        label={t("sidebar.needsYouCount", { count: row.needsYouCount })}
      />
    </button>
  );
}
