/**
 * In-memory state for the fake Houston host.
 *
 * Models just enough of the host + per-agent runtime for the desktop
 * UI (app/src) to boot and run on the host adapter (host mode):
 * agents, their `.houston/**` files (the board reads `.houston/activity/
 * activity.json` directly — files-first), and per-conversation chat history. One
 * process serves every test; `reset()` restores the seed between tests.
 *
 * `.houston/activity/activity.json` and the `/agents/:id/activities` REST route
 * are the SAME data (as in the real host), so a chat turn flipping a
 * card's status (PATCH /activities) shows up on the board (which reads the file).
 *
 * Wire types come from the real packages so a contract change breaks the
 * typecheck here instead of silently drifting the mock.
 */

import type { ChatMessage, TokenUsage } from "@houston/runtime-client";
import type { Activity } from "@houston-ai/engine-client";
import { SEED_AGENT_ID, SEED_AGENT_NAME, SEED_WORKSPACE_ID } from "./ports";

/** The host's agent wire model, mapped to the UI `Agent` by control-plane.ts. */
export interface CpAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
}

const ACTIVITY_PATH = ".houston/activity/activity.json";
const SEED_USAGE: TokenUsage = {
  context_tokens: 1200,
  output_tokens: 80,
  cached_tokens: 0,
};
const EPOCH = Date.UTC(2024, 0, 1);
const ISO = new Date(EPOCH).toISOString();

const SEED_ACTIVITIES: Activity[] = [
  {
    id: "act-1",
    title: "Plan a trip to Tokyo",
    description: "Research flights and hotels for the spring",
    status: "needs_you",
    updated_at: ISO,
  },
  {
    id: "act-2",
    title: "Draft the launch email",
    description: "Write the beta announcement to the waitlist",
    status: "done",
    updated_at: ISO,
  },
];

interface HostState {
  agents: CpAgent[];
  /** `${agentId}:${relPath}` -> file content (the `.houston/**` files-first store) */
  files: Map<string, string>;
  /** `${agentId}:${conversationId}` -> message history */
  histories: Map<string, ChatMessage[]>;
  agentSeq: number;
  activitySeq: number;
}

let state: HostState = freshState();

function fileKey(agentId: string, relPath: string): string {
  return `${agentId}:${relPath}`;
}

function freshState(): HostState {
  const files = new Map<string, string>();
  files.set(
    fileKey(SEED_AGENT_ID, ACTIVITY_PATH),
    JSON.stringify(SEED_ACTIVITIES),
  );
  return {
    agents: [
      {
        id: SEED_AGENT_ID,
        workspaceId: SEED_WORKSPACE_ID,
        name: SEED_AGENT_NAME,
        createdAt: EPOCH,
      },
    ],
    files,
    histories: new Map(),
    agentSeq: 1,
    activitySeq: 2,
  };
}

/** Restore the seed. Called by the harness before each test. */
export function reset(): void {
  state = freshState();
  domainListeners.clear();
}

// ---- domain reactivity (the /v1/events feed) ----
type DomainListener = (event: {
  type: string;
  agentPath?: string;
  workspaceId?: string;
}) => void;
const domainListeners = new Set<DomainListener>();

export function onDomainEvent(fn: DomainListener): () => void {
  domainListeners.add(fn);
  return () => domainListeners.delete(fn);
}
function emitDomain(type: string, agentPath?: string): void {
  for (const fn of domainListeners)
    fn({ type, agentPath, workspaceId: SEED_WORKSPACE_ID });
}
/** Public emit, used by the `/__test__/emit` control route to drive reactivity. */
export function emit(type: string, agentPath?: string): void {
  emitDomain(type, agentPath);
}

// ---- agents ----
export function listAgents(): CpAgent[] {
  return state.agents;
}
export function createAgent(name: string): CpAgent {
  const agent: CpAgent = {
    id: `agent-${++state.agentSeq}`,
    workspaceId: SEED_WORKSPACE_ID,
    name,
    createdAt: EPOCH,
  };
  state.agents.push(agent);
  state.files.set(fileKey(agent.id, ACTIVITY_PATH), "[]");
  emitDomain("AgentsChanged");
  return agent;
}
export function renameAgent(id: string, name: string): CpAgent | null {
  const agent = state.agents.find((a) => a.id === id);
  if (!agent) return null;
  agent.name = name;
  emitDomain("AgentsChanged");
  return agent;
}
export function deleteAgent(id: string): boolean {
  const before = state.agents.length;
  state.agents = state.agents.filter((a) => a.id !== id);
  for (const key of [...state.files.keys()])
    if (key.startsWith(`${id}:`)) state.files.delete(key);
  if (state.agents.length === before) return false;
  emitDomain("AgentsChanged");
  return true;
}

// ---- agent files (.houston/**) ----
export function readAgentFile(agentId: string, relPath: string): string {
  return state.files.get(fileKey(agentId, relPath)) ?? "";
}
export function writeAgentFile(
  agentId: string,
  relPath: string,
  content: string,
): void {
  state.files.set(fileKey(agentId, relPath), content);
  // The real file watcher fires ActivityChanged when the board file is written.
  if (relPath === ACTIVITY_PATH) emitDomain("ActivityChanged", agentId);
}

// ---- activities (board) — backed by the SAME activity.json the board reads ----
export function listActivities(agentId: string): Activity[] {
  try {
    return JSON.parse(
      state.files.get(fileKey(agentId, ACTIVITY_PATH)) || "[]",
    ) as Activity[];
  } catch {
    return [];
  }
}
function setActivities(agentId: string, items: Activity[]): void {
  state.files.set(fileKey(agentId, ACTIVITY_PATH), JSON.stringify(items));
  emitDomain("ActivityChanged", agentId);
}
export function createActivity(
  agentId: string,
  input: Partial<Activity>,
): Activity {
  const activity: Activity = {
    id: `act-${++state.activitySeq}`,
    title: input.title ?? "Untitled",
    description: input.description ?? "",
    status: input.status ?? "running",
    session_key: input.session_key,
    updated_at: ISO,
  };
  setActivities(agentId, [...listActivities(agentId), activity]);
  return activity;
}
export function updateActivity(
  agentId: string,
  id: string,
  updates: Partial<Activity>,
): Activity | null {
  const items = listActivities(agentId);
  const activity = items.find((a) => a.id === id);
  if (!activity) return null;
  Object.assign(activity, updates, { updated_at: ISO });
  setActivities(agentId, items);
  return activity;
}
export function deleteActivity(agentId: string, id: string): void {
  setActivities(
    agentId,
    listActivities(agentId).filter((a) => a.id !== id),
  );
}

// ---- chat history ----
export function getHistory(
  agentId: string,
  conversationId: string,
): ChatMessage[] {
  return state.histories.get(`${agentId}:${conversationId}`) ?? [];
}
/** Record a settled turn so a reload (loadChatHistory) replays it. */
export function appendTurn(
  agentId: string,
  conversationId: string,
  userText: string,
  replyText: string,
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  list.push({ role: "user", content: userText, ts: EPOCH });
  list.push({
    role: "assistant",
    content: replyText,
    ts: EPOCH,
    usage: SEED_USAGE,
  });
  state.histories.set(key, list);
}

export const seedUsage = SEED_USAGE;
