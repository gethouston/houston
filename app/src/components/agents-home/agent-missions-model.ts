import type { CreatedMission } from "../../lib/created-mission-handoff.ts";
import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../../lib/mission-selection.ts";
import {
  type TaskListFilterId,
  type TaskListSectionId,
  taskListSectionsFor,
} from "../board/task-list-model.ts";
import { missionColumnIdForStatus } from "../mission-board-columns.ts";
import {
  type AgentHomeConversation,
  updatedAtMs,
} from "./agents-home-model.ts";

/**
 * One agent's task list, as rules: how the swept rows split into the screen's
 * bands, and what the segmented control and the search narrow them to. Pure,
 * so `app/tests/agent-missions-model.test.ts` pins them without rendering.
 */

/** One agent's missions, split the way the screen sections them. */
export interface AgentMissionSections {
  needsYou: AgentHomeConversation[];
  running: AgentHomeConversation[];
  done: AgentHomeConversation[];
  archived: AgentHomeConversation[];
}

/**
 * Section one agent's swept rows, newest movement first in every section.
 * The status→section mapping is the board's own (`missionColumnIdForStatus`),
 * so a mission always sits in the same section here as the column it occupies
 * on the board this screen pushes into.
 */
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
    updatedAtMs(b) - updatedAtMs(a);
  sections.needsYou.sort(byRecency);
  sections.running.sort(byRecency);
  sections.done.sort(byRecency);
  sections.archived.sort(byRecency);
  return sections;
}

/**
 * The bands the body draws, and what the shared segmented control narrows them
 * to, are the phone task list's own rules ({@link taskListSectionsFor}): one
 * grammar for an agent's list and a team's, so a task never sits in a
 * different band depending on which screen found it.
 */
export interface MissionListSection {
  id: TaskListSectionId;
  missions: AgentHomeConversation[];
}

/** Case-insensitive TITLE search; a blank query keeps every row. */
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

/**
 * The bands to draw: the segment's own section (or all three), searched, with
 * the empty ones dropped — an empty band vanishes rather than rendering a
 * heading over nothing.
 */
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

/** Every mission the agent holds, the archive included. */
export function agentMissionCount(sections: AgentMissionSections): number {
  return (
    sections.needsYou.length +
    sections.running.length +
    sections.done.length +
    sections.archived.length
  );
}

/**
 * The agent's LIVE work, which the header counts: the archive is filed away,
 * and counting it would make a finished agent look busy.
 */
export function liveMissionCount(sections: AgentMissionSections): number {
  return agentMissionCount(sections) - sections.archived.length;
}

/**
 * Whether the published mission target is the one just created for this
 * agent: the only published target the agent's own screen may claim, since
 * every other "open this mission" nav belongs to a board.
 */
export function isCreatedMissionOf(
  created: Pick<CreatedMission, "activityId" | "agentPath"> | null,
  pendingId: string | null,
  agentPath: string,
): pendingId is string {
  return (
    pendingId !== null &&
    created !== null &&
    created.activityId === pendingId &&
    created.agentPath === agentPath
  );
}
