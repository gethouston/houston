import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../organization/org-time";
import type { AgentHomeConversation } from "./agents-home-model";

/**
 * One mission on the per-agent missions screen: title over nothing (the
 * section header already says the state), relative movement time flushed
 * right. Same plane-row language as the home list's cells, one tap target.
 */
export function AgentMissionRow({
  mission,
  onOpen,
}: {
  mission: AgentHomeConversation;
  onOpen: (mission: AgentHomeConversation) => void;
}) {
  const { i18n } = useTranslation();
  const atMs = mission.updated_at ? Date.parse(mission.updated_at) : Number.NaN;
  return (
    <button
      type="button"
      data-testid="agent-mission-row"
      onClick={() => onOpen(mission)}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {mission.title}
      </span>
      {!Number.isNaN(atMs) && (
        // data-relative-time: a live clock the visual suite masks.
        <span
          data-relative-time
          className="shrink-0 text-xs text-ink-muted tabular-nums"
        >
          {formatRelativeTime(atMs, i18n.language)}
        </span>
      )}
    </button>
  );
}
