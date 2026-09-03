import type { KanbanItem } from "@houston-ai/board";
import { TaskListGroup } from "@houston-ai/board";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentStore } from "../../stores/agents";
import type { BoardSource } from "./board-source";
import { useTaskListChrome } from "./task-list-chrome";
import { TaskListFilter } from "./task-list-filter";
import {
  type TaskListFilterId,
  type TaskListSectionId,
  taskListGroups,
  taskListNeedsYouCount,
} from "./task-list-model";
import { TaskListSearch } from "./task-list-search";
import { TeamTaskRow } from "./team-task-row";

const SECTION_LABEL_KEYS = {
  needsYou: "dashboard:columns.needsYou",
  running: "dashboard:columns.running",
  done: "dashboard:columns.done",
} as const satisfies Record<TaskListSectionId, string>;

/**
 * A team's Tasks section on the phone: the board's three columns as one
 * scrolling list of shared task rows, under the same segmented control the
 * per-agent list wears.
 *
 * A pager was the wrong shape here. A team's board spans several agents, so
 * the question a phone user arrives with is "what is waiting on me", not
 * "what is in column two" — and a list answers it in one screen instead of
 * three swipes. The rows carry the OWNING agent's helmet, which is the one
 * thing a team's list needs that an agent's does not.
 *
 * The one-sweep rule holds: this renders `source.items` (already the swept,
 * scoped, searched set) and narrows it in memory. It never asks its own
 * question.
 */
export function TeamTaskList({ source }: { source: BoardSource }) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const agents = useAgentStore((s) => s.agents);
  const chrome = useTaskListChrome();
  const [filter, setFilter] = useState<TaskListFilterId>("all");

  const groups = taskListGroups(source.items, filter);
  const agentFor = (item: KanbanItem) =>
    agents.find((a) => a.folderPath === item.metadata?.agentPath) ?? null;
  const closeSearch = () => {
    chrome.setSearchOpen(false);
    source.search.setQuery("");
  };

  return (
    <div data-testid="team-task-list" className="flex min-h-0 flex-1 flex-col">
      <TaskListFilter
        active={filter}
        // Counted over the whole scoped set, not the searched one: the badge
        // says how much is waiting on the user, never how much the current
        // query happened to leave standing.
        needsYouCount={taskListNeedsYouCount(source.allItems)}
        onSelect={setFilter}
        testId="team-task-filter"
      />
      {chrome.searchOpen && (
        <TaskListSearch
          query={source.search.query}
          onQuery={source.search.setQuery}
          onClose={closeSearch}
          testId="team-task-search"
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {source.allItems.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>{t("shell:taskList.noTasks.title")}</EmptyTitle>
              <EmptyDescription>
                {t("shell:taskList.noTasks.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : groups.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-muted">
            {source.hasSearchQuery
              ? t("shell:taskList.searchEmpty")
              : t("shell:taskList.filterEmpty")}
          </p>
        ) : (
          groups.map((group) => (
            <TaskListGroup
              key={group.id}
              heading={t(SECTION_LABEL_KEYS[group.id])}
              count={group.items.length}
            >
              {group.items.map((item) => (
                <TeamTaskRow
                  key={item.id}
                  item={item}
                  section={group.id}
                  agent={agentFor(item)}
                  onSelect={source.setSelectedId}
                />
              ))}
            </TaskListGroup>
          ))
        )}
      </div>
    </div>
  );
}
