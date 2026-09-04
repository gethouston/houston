import type { TaskRowStatus } from "@houston-ai/board";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../organization/org-time";
import { AgentAvatarStack } from "./agent-avatar-stack";
import type { AgentHomeConversation } from "./agents-home-model";
import { MissionStatusTag } from "./mission-status-tag";

/**
 * One task in the phone's per-agent list, in the same chat-list grammar as
 * the Agents home row above it: the agent's large avatar on the left (its
 * running ring while THIS task runs), the task's title with the movement's
 * time trailing, the preview line under it ("Typing" while running, else the
 * task's own description), and the status label as a small tag beneath.
 *
 * The avatar is the AGENT's, repeated on every row on purpose: the list is
 * one agent's thread of conversations, and the mark is what says so at a
 * glance, exactly as a chat list repeats the correspondent's face. The
 * divider between rows is the LIST's (one hairline per row, inset the same
 * distance from both screen edges), so this cell draws none.
 */
export function AgentMissionRow({
  mission,
  status,
  color,
  onOpen,
}: {
  mission: AgentHomeConversation;
  status: TaskRowStatus;
  /** The owning agent's stored colour id. */
  color?: string;
  onOpen: (mission: AgentHomeConversation) => void;
}) {
  const { t, i18n } = useTranslation("shell");
  const atMs = mission.updated_at ? Date.parse(mission.updated_at) : Number.NaN;
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
            {!Number.isNaN(atMs) && (
              // data-relative-time: a live clock the visual suite masks.
              <span
                data-relative-time
                className="shrink-0 text-xs text-ink-muted tabular-nums"
              >
                {formatRelativeTime(atMs, i18n.language)}
              </span>
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
          <span className="mt-1 flex">
            <MissionStatusTag status={status} />
          </span>
        </span>
      </button>
    </li>
  );
}
