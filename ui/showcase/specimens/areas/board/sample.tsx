import type {
  ConversationEntry,
  KanbanColumnConfig,
  KanbanItem,
  KanbanPerson,
} from "@houston-ai/board";
import { Bot } from "lucide-react";

/**
 * The Activity area's shared fixture: one workspace's missions across two
 * agents, frozen at a fixed instant.
 *
 * Every page in this folder reads from here so a reviewer comparing the card,
 * the column and the whole board is looking at the SAME missions — a difference
 * on screen is then a difference in the component, never in the copy. The
 * timestamps are literals rather than `Date.now()` offsets so the board's
 * newest-first sort renders identically on every run.
 *
 * Exports no `specimen`, so the registry walks past it (helper modules are
 * pulled in by the pages that use them).
 */

/** The teammates a mission is attributed to. Ids are stable, which is what
 *  `personToneClass` hashes — the same person keeps one colour everywhere. */
export const PEOPLE: KanbanPerson[] = [
  { id: "u-julian", label: "Julian Mora" },
  { id: "u-ana", label: "Ana Silva" },
  { id: "u-marco", label: "Marco Duarte" },
  { id: "u-priya", label: "Priya Nair" },
  { id: "u-lena", label: "Lena Fischer" },
  { id: "u-tomas", label: "Tomás Vidal" },
  { id: "u-rin", label: "Rin Watanabe" },
];

/** The agent helmet every card on a board wears as its leading icon. The board
 *  passes ONE node for the whole board (`avatar`), not one per card. */
export const AGENT_ICON = <Bot className="size-3.5 shrink-0 text-ink-muted" />;

/** The mission board's three sections, exactly as the app builds them. */
export const COLUMNS: KanbanColumnConfig[] = [
  { id: "running", label: "Running", statuses: ["running"] },
  { id: "needs-you", label: "Needs you", statuses: ["needs_you"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

export const RUNNING_MISSION: KanbanItem = {
  id: "m-triage",
  group: "Inbox Zero",
  title: "Triage this morning's 34 unread threads",
  description: "Nine need a real answer. Drafting those now.",
  status: "running",
  updatedAt: "2026-03-04T09:12:00.000Z",
  people: [PEOPLE[0], PEOPLE[1]],
};

export const NEEDS_YOU_MISSION: KanbanItem = {
  id: "m-refund",
  group: "Inbox Zero",
  title: "Approve the refund reply to Dana Reyes",
  description: "She has asked twice. The draft offers the full amount back.",
  status: "needs_you",
  updatedAt: "2026-03-04T08:40:00.000Z",
  people: [PEOPLE[0]],
};

export const DONE_MISSION: KanbanItem = {
  id: "m-standup",
  group: "Meeting Notes",
  title: "Monday standup summary",
  description: "Filed to the team doc, five follow-ups assigned.",
  status: "done",
  updatedAt: "2026-03-04T07:05:00.000Z",
  tags: ["Calendar", "Notion"],
  people: PEOPLE.slice(1, 7),
};

export const ERROR_MISSION: KanbanItem = {
  id: "m-calendar",
  group: "Meeting Notes",
  title: "Could not join the 10:00 call",
  description: "The Google Calendar connection expired on Friday.",
  status: "error",
  updatedAt: "2026-03-04T06:30:00.000Z",
};

/** Every mission the board renders, one per section plus the failed one. */
export const MISSIONS: KanbanItem[] = [
  RUNNING_MISSION,
  {
    id: "m-receipts",
    group: "Inbox Zero",
    title: "File last week's receipts",
    description: "Eleven found so far, all from the travel thread.",
    status: "running",
    updatedAt: "2026-03-04T08:55:00.000Z",
    people: [PEOPLE[2]],
  },
  NEEDS_YOU_MISSION,
  ERROR_MISSION,
  DONE_MISSION,
];

/** The archived list's rows, including one that only matched in its body. */
export const ARCHIVED: KanbanItem[] = [
  DONE_MISSION,
  {
    id: "m-quarter",
    group: "Meeting Notes",
    title: "Q1 board review notes",
    status: "done",
    updatedAt: "2026-02-27T16:20:00.000Z",
  },
  {
    id: "m-welcome",
    group: "Inbox Zero",
    title: "Reply to the three new customer intros",
    status: "done",
    updatedAt: "2026-02-24T11:02:00.000Z",
  },
];

/** The unified conversation feed: the agent's main chat plus its missions. */
export const CONVERSATIONS: ConversationEntry[] = [
  {
    id: "c-main",
    title: "Inbox Zero",
    type: "primary",
    sessionKey: "main",
    agentPath: "/Users/julian/.houston/workspaces/Personal/Inbox Zero",
    agentName: "Inbox Zero",
    updatedAt: "2026-03-04T09:14:00.000Z",
    status: "running",
  },
  {
    id: "c-refund",
    title: "Approve the refund reply to Dana Reyes",
    type: "activity",
    sessionKey: "activity-m-refund",
    agentPath: "/Users/julian/.houston/workspaces/Personal/Inbox Zero",
    agentName: "Inbox Zero",
    updatedAt: "2026-03-04T08:40:00.000Z",
    status: "needs_you",
  },
  {
    id: "c-standup",
    title: "Monday standup summary",
    type: "activity",
    sessionKey: "activity-m-standup",
    agentPath: "/Users/julian/.houston/workspaces/Personal/Meeting Notes",
    agentName: "Meeting Notes",
    updatedAt: "2026-03-04T07:05:00.000Z",
    status: "done",
  },
];
