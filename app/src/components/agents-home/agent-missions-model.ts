import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../../lib/mission-selection.ts";
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

/** The segmented control's positions. "all" is the resting one. */
export type MissionFilterId = "all" | "needs_you" | "running" | "done";

/** Render order, and the order the segments are drawn in. */
export const MISSION_FILTER_IDS = [
  "all",
  "needs_you",
  "running",
  "done",
] as const satisfies readonly MissionFilterId[];

/** The bands the body draws, in order. The archive is NOT one of them: it is
 *  its own collapsed drawer at the bottom of the unfiltered list. */
export type MissionSectionId = "needsYou" | "running" | "done";

const SECTION_FOR_FILTER: Record<
  Exclude<MissionFilterId, "all">,
  MissionSectionId
> = { needs_you: "needsYou", running: "running", done: "done" };

const SECTION_ORDER = ["needsYou", "running", "done"] as const;

export interface MissionListSection {
  id: MissionSectionId;
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

/**
 * The bands to draw: the segment's own section (or all three), searched, with
 * the empty ones dropped — an empty band vanishes rather than rendering a
 * heading over nothing.
 */
export function missionListSections(
  sections: AgentMissionSections,
  filter: MissionFilterId,
  query: string,
): MissionListSection[] {
  const wanted =
    filter === "all" ? SECTION_ORDER : [SECTION_FOR_FILTER[filter]];
  return wanted.flatMap((id) => {
    const missions = searchMissions(sections[id], query);
    return missions.length === 0 ? [] : [{ id, missions }];
  });
}
