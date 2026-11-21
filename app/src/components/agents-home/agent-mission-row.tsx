import type { TaskRowStatus } from "@houston-ai/board";
import { useTranslation } from "react-i18next";
import { useMessageTime } from "../../hooks/use-message-time";
import { AgentAvatarStack } from "./agent-avatar-stack";
import type { AgentHomeConversation } from "./agents-home-model";
import { MissionOriginTag } from "./mission-origin-tag";
import { MissionStatusTag } from "./mission-status-tag";

export function AgentMissionRow({
  mission,
  status,
  originTag,
  color,
  onOpen,
}: {
  mission: AgentHomeConversation;
  status: TaskRowStatus;
  originTag?: string;
  color?: string;
  onOpen: (mission: AgentHomeConversation) => void;
}) {
  const { t } = useTranslation("shell");
  const formatTime = useMessageTime();
  const iso = mission.last_message_at ?? mission.updated_at;
  const time = iso ? formatTime(iso) : undefined;
  const running = status === "running";
  return (
    <li className="mx-4 border-b border-line last:border-b-0">
      <button
        type="button"
        data-testid="agent-mission-row"
        data-status={status}
        onClick={() => onOpen(mission)}
        className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-hover active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <AgentAvatarStack color={color} running={running} stacked={false} />
        <span className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-base font-weight-510 text-ink">
              {mission.title}
            </span>
            {time && (
              <time
                dateTime={iso}
                title={time.full}
                data-relative-time
                className="shrink-0 text-xs text-ink-muted tabular-nums"
              >
                {time.short}
              </time>
            )}
          </span>
          {(running || mission.description) && (
            <span
              className={
                running
                  ? "truncate text-sm font-weight-510 text-success"
                  : "truncate text-sm text-ink-muted"
              }
            >
              {running ? t("agentsHome.typing") : mission.description}
            </span>
          )}
          <span className="mt-1 flex min-w-0 gap-1">
            <MissionStatusTag status={status} />
            {originTag && <MissionOriginTag label={originTag} />}
          </span>
        </span>
      </button>
    </li>
  );
}
