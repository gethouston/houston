import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../organization/org-time";
import { NeedsYouChip } from "../shell/agent-sidebar-status";
import { AgentAvatarStack } from "./agent-avatar-stack";
import { type AgentHomeRow, agentHomePreview } from "./agents-home-model";

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
