import { TaskListGroup, TaskRow, type TaskRowStatus } from "@houston-ai/board";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type {
  TaskListFilterId,
  TaskListSectionId,
} from "../board/task-list-model";
import { formatRelativeTime } from "../organization/org-time";
import {
  type AgentMissionSections,
  missionListSections,
  searchMissions,
} from "./agent-missions-model";
import type { AgentHomeConversation } from "./agents-home-model";

const SECTION_LABEL_KEYS = {
  needsYou: "dashboard:columns.needsYou",
  running: "dashboard:columns.running",
  done: "dashboard:columns.done",
} as const satisfies Record<TaskListSectionId, string>;

const SECTION_STATUS = {
  needsYou: "needs_you",
  running: "running",
  done: "done",
} as const satisfies Record<TaskListSectionId, TaskRowStatus>;

/**
 * One agent's tasks: the board's sections as bands of shared task rows, with
 * the archive folded at the bottom.
 *
 * The archive only exists under "All": it is the list's basement, and offering
 * it under a status segment would answer a question the segment did not ask —
 * the "…" menu's Archived action is what opens it, resetting the segment on
 * the way.
 */
export function AgentMissionsList({
  sections,
  filter,
  query,
  archivedOpen,
  archivedRef,
  onToggleArchived,
  onOpen,
  onOpenArchived,
}: {
  sections: AgentMissionSections;
  filter: TaskListFilterId;
  query: string;
  archivedOpen: boolean;
  archivedRef: RefObject<HTMLDivElement | null>;
  onToggleArchived: () => void;
  onOpen: (mission: AgentHomeConversation) => void;
  onOpenArchived: (mission: AgentHomeConversation) => void;
}) {
  const { t, i18n } = useTranslation(["shell", "dashboard"]);
  const groups = missionListSections(sections, filter, query);
  const archived =
    filter === "all" ? searchMissions(sections.archived, query) : [];
  const labels = {
    needsYou: t("dashboard:columns.needsYou"),
    running: t("dashboard:columns.running"),
    done: t("dashboard:columns.done"),
    archived: t("shell:taskList.archived"),
  };
  const row = (
    mission: AgentHomeConversation,
    status: TaskRowStatus,
    open: (mission: AgentHomeConversation) => void,
  ) => {
    const atMs = mission.updated_at
      ? Date.parse(mission.updated_at)
      : Number.NaN;
    return (
      <TaskRow
        key={mission.id}
        status={status}
        title={mission.title}
        preview={mission.description}
        labels={labels}
        dataAttrs={{ "data-testid": "agent-mission-row" }}
        onSelect={() => open(mission)}
        trailing={
          Number.isNaN(atMs) ? undefined : (
            // data-relative-time: a live clock the visual suite masks.
            <span data-relative-time>
              {formatRelativeTime(atMs, i18n.language)}
            </span>
          )
        }
      />
    );
  };

  const total =
    sections.needsYou.length +
    sections.running.length +
    sections.done.length +
    sections.archived.length;
  if (total === 0)
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>{t("shell:taskList.noTasks.title")}</EmptyTitle>
          <EmptyDescription>
            {t("shell:taskList.noTasks.description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  if (groups.length === 0 && archived.length === 0)
    return (
      <p className="px-4 py-4 text-sm text-ink-muted">
        {query.trim() === ""
          ? t("shell:taskList.filterEmpty")
          : t("shell:taskList.searchEmpty")}
      </p>
    );

  return (
    <>
      {groups.map((group) => (
        <TaskListGroup
          key={group.id}
          heading={t(SECTION_LABEL_KEYS[group.id])}
          count={group.missions.length}
        >
          {group.missions.map((mission) =>
            row(mission, SECTION_STATUS[group.id], onOpen),
          )}
        </TaskListGroup>
      ))}
      {archived.length > 0 && (
        <div ref={archivedRef}>
          <TaskListGroup
            heading={t("shell:taskList.archived")}
            count={archived.length}
            collapsible
            open={archivedOpen}
            onToggle={onToggleArchived}
            dataAttrs={{ "data-testid": "agent-missions-archived-toggle" }}
          >
            {archived.map((mission) =>
              row(mission, "archived", onOpenArchived),
            )}
          </TaskListGroup>
        </div>
      )}
    </>
  );
}
