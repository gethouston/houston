import { TaskListGroup, type TaskRowStatus } from "@houston-ai/board";
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
import { AgentMissionRow } from "./agent-mission-row";
import {
  type AgentMissionSections,
  agentMissionCount,
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

export function AgentMissionsList({
  sections,
  agentColor,
  filter,
  query,
  archivedOpen,
  archivedRef,
  onToggleArchived,
  onOpen,
  originTagOf,
}: {
  sections: AgentMissionSections;
  agentColor?: string;
  filter: TaskListFilterId;
  query: string;
  archivedOpen: boolean;
  archivedRef: RefObject<HTMLDivElement | null>;
  onToggleArchived: () => void;
  onOpen: (mission: AgentHomeConversation) => void;
  originTagOf: (mission: AgentHomeConversation) => string | undefined;
}) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const groups = missionListSections(sections, filter, query);
  const archived =
    filter === "all" ? searchMissions(sections.archived, query) : [];
  const row = (mission: AgentHomeConversation, status: TaskRowStatus) => (
    <AgentMissionRow
      key={mission.id}
      mission={mission}
      status={status}
      originTag={originTagOf(mission)}
      color={agentColor}
      onOpen={onOpen}
    />
  );

  if (agentMissionCount(sections) === 0)
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
          <ul>
            {group.missions.map((mission) =>
              row(mission, SECTION_STATUS[group.id]),
            )}
          </ul>
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
            <ul>{archived.map((mission) => row(mission, "archived"))}</ul>
          </TaskListGroup>
        </div>
      )}
    </>
  );
}
