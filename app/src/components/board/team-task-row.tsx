import type { KanbanItem, TaskRowStatus } from "@houston-ai/board";
import { TaskRow } from "@houston-ai/board";
import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { openMissionChatForPath } from "../../lib/mission-chat";
import { perfSpans } from "../../lib/perf-spans";
import type { Agent } from "../../lib/types";
import type { TaskListSectionId } from "./task-list-model";

const SECTION_STATUS = {
  needsYou: "needs_you",
  running: "running",
  done: "done",
} as const satisfies Record<TaskListSectionId, TaskRowStatus>;

/**
 * One mission as a row of a team's phone task list.
 *
 * Trailing is the OWNING agent's helmet rather than a relative time: a team's
 * list mixes agents, so "who is on this" is the thing the row cannot say any
 * other way, and the band it sits in already says how fresh it is. The name
 * rides along for screen readers, because a colour is not a name.
 *
 * The tap is the same fork a board card performs below the breakpoint: push
 * the mission's chat screen. A card whose agent left the roster mid-render
 * falls back to the board's own selection, exactly as `MissionBoard` does.
 */
export function TeamTaskRow({
  item,
  section,
  agent,
  onSelect,
}: {
  item: KanbanItem;
  section: TaskListSectionId;
  agent: Agent | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const open = () => {
    // Card-open perf mark (HOU-1011), the same one the board's tap raises.
    perfSpans.cardClicked();
    const agentPath = item.metadata?.agentPath as string | undefined;
    if (openMissionChatForPath(agentPath, item.id)) return;
    onSelect(item.id);
  };
  return (
    <TaskRow
      status={SECTION_STATUS[section]}
      title={item.title}
      preview={
        section === "running" ? t("shell:agentsHome.typing") : item.description
      }
      labels={{
        needsYou: t("dashboard:columns.needsYou"),
        running: t("dashboard:columns.running"),
        done: t("dashboard:columns.done"),
        archived: t("shell:taskList.archived"),
      }}
      dataAttrs={{ "data-testid": "team-task-row" }}
      onSelect={open}
      trailing={
        agent ? (
          <>
            <HoustonAvatar
              color={resolveAgentColor(agent.color)}
              diameter={20}
            />
            <span className="sr-only">{agent.name}</span>
          </>
        ) : undefined
      }
    />
  );
}
