import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../../lib/mission-selection.ts";
import type { TeamSectionId } from "../../lib/team-sections.ts";
import {
  type TaskListFilterId,
  type TaskListSectionId,
  taskListSectionsFor,
} from "../board/task-list-model.ts";
import { missionColumnIdForStatus } from "../mission-board-columns.ts";
import type { AgentHomeConversation } from "./agents-home-model.ts";

export interface AgentMissionSections {
  needsYou: AgentHomeConversation[];
  running: AgentHomeConversation[];
  done: AgentHomeConversation[];
  archived: AgentHomeConversation[];
}

export function agentMissionSections(
  conversations: readonly AgentHomeConversation[] | undefined,
  agentPath: string,
): AgentMissionSections {
  const sections: AgentMissionSections = {
    needsYou: [],
    running: [],
    done: [],
    archived: [],
  };
  for (const row of conversations ?? []) {
    if (row.agent_path !== agentPath) continue;
    if (row.type !== "activity") continue;
    if (isSetupChatMode(row.agent)) continue;
    if (row.status === ARCHIVED_STATUS) {
      sections.archived.push(row);
      continue;
    }
    const column = missionColumnIdForStatus(row.status ?? "");
    if (column === "needs_you") sections.needsYou.push(row);
    else if (column === "running") sections.running.push(row);
    else if (column === "done") sections.done.push(row);
  }
  const byRecency = (a: AgentHomeConversation, b: AgentHomeConversation) =>
    (Date.parse(b.last_message_at ?? b.updated_at ?? "") || 0) -
    (Date.parse(a.last_message_at ?? a.updated_at ?? "") || 0);
  sections.needsYou.sort(byRecency);
  sections.running.sort(byRecency);
  sections.done.sort(byRecency);
  sections.archived.sort(byRecency);
  return sections;
}

export interface MissionListSection {
  id: TaskListSectionId;
  missions: AgentHomeConversation[];
}

export function searchMissions(
  missions: readonly AgentHomeConversation[],
  query: string,
): AgentHomeConversation[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [...missions];
  return missions.filter((m) => m.title.toLocaleLowerCase().includes(needle));
}

const SECTION_KEY = {
  needsYou: "needsYou",
  running: "running",
  done: "done",
} as const satisfies Record<TaskListSectionId, keyof AgentMissionSections>;

export function missionListSections(
  sections: AgentMissionSections,
  filter: TaskListFilterId,
  query: string,
): MissionListSection[] {
  return taskListSectionsFor(filter).flatMap((id) => {
    const missions = searchMissions(sections[SECTION_KEY[id]], query);
    return missions.length === 0 ? [] : [{ id, missions }];
  });
}

export function agentMissionCount(sections: AgentMissionSections): number {
  return (
    sections.needsYou.length +
    sections.running.length +
    sections.done.length +
    sections.archived.length
  );
}

export function liveMissionCount(sections: AgentMissionSections): number {
  return agentMissionCount(sections) - sections.archived.length;
}

export type AgentMissionsMenuSection = Exclude<
  TeamSectionId,
  "mission-control"
>;

export function agentMissionsMenuSections(
  sections: readonly TeamSectionId[],
): AgentMissionsMenuSection[] {
  return sections.filter(
    (section): section is AgentMissionsMenuSection =>
      section !== "mission-control",
  );
}
