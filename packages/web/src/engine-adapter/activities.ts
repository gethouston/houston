import type {
  Activity,
  ActivityUpdate,
  ConversationEntry,
  NewActivity,
  PendingInteraction,
} from "../../../../ui/engine-client/src/types";
import { readAgentFile, writeAgentFile } from "./agent-files";

/**
 * Activities (the board) live in the agent's `.houston/activity/activity.json`,
 * the SAME file the desktop UI's `data/activity.ts` reads/writes through
 * `readAgentFile` / `writeAgentFile`. Backing these adapter methods by that file
 * (rather than a separate bucket) keeps the board, the conversation list, and
 * mission auto-titling (`getEngine().updateActivity`) on one source of truth.
 * Each activity's `session_key` is the new engine's conversation id.
 */
const ACTIVITY_REL = ".houston/activity/activity.json";

function read(agentPath: string): Activity[] {
  const raw = readAgentFile(agentPath, ACTIVITY_REL);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Activity[]) : [];
  } catch {
    return [];
  }
}

function write(agentPath: string, items: Activity[]): void {
  writeAgentFile(agentPath, ACTIVITY_REL, JSON.stringify(items, null, 2));
}

export function listActivities(agentPath: string): Activity[] {
  return read(agentPath);
}

/**
 * Board card ← activity. Mission Control renders tags/attribution from
 * `agent` (mode) and `routine_id` (routine chat), so both must survive the
 * mapping — dropping them loses the card's routine/mode tags (HOU-665).
 */
export function activityToConversation(
  a: Activity,
  agentPath: string,
  agentName: string,
): ConversationEntry {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    status: a.status,
    type: "activity",
    session_key: a.session_key ?? `activity-${a.id}`,
    updated_at: a.updated_at,
    agent_path: agentPath,
    agent_name: agentName,
    agent: a.agent,
    routine_id: a.routine_id,
    // Teams attribution (server-stamped in multiplayer only). Spread
    // conditionally so single-player entries don't carry undefined keys.
    ...(a.created_by !== undefined && { created_by: a.created_by }),
    ...(a.contributors !== undefined && { contributors: a.contributors }),
  };
}

export function createActivity(
  agentPath: string,
  input: NewActivity,
): Activity {
  const id = input.id ?? crypto.randomUUID();
  const activity: Activity = {
    id,
    title: input.title || "New chat",
    description: input.description ?? "",
    status: "running",
    session_key: `activity-${id}`,
    agent: input.agent,
    provider: input.provider,
    model: input.model,
    updated_at: new Date().toISOString(),
  };
  write(agentPath, [...read(agentPath), activity]);
  return activity;
}

export function updateActivity(
  agentPath: string,
  id: string,
  updates: ActivityUpdate,
): Activity {
  const items = read(agentPath);
  const idx = items.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error(`activity ${id} not found`);
  // `pending_interaction: null` clears it, a value sets it, absent leaves it —
  // the same contract as the domain's applyActivityUpdate (null is an
  // update-only signal; the Activity itself never stores null).
  const { pending_interaction, ...rest } = updates;
  const next: Activity = {
    ...items[idx],
    ...rest,
    updated_at: new Date().toISOString(),
  };
  if (pending_interaction) next.pending_interaction = pending_interaction;
  else if (pending_interaction === null) delete next.pending_interaction;
  items[idx] = next;
  write(agentPath, items);
  return next;
}

export function deleteActivity(agentPath: string, id: string): void {
  write(
    agentPath,
    read(agentPath).filter((a) => a.id !== id),
  );
}

/**
 * Set an activity's status from a turn's session key. The board creates missions
 * without an explicit `session_key`, so the chat keys off the `activity-<id>`
 * convention; match either form.
 */
export function setStatusBySessionKey(
  agentPath: string,
  sessionKey: string,
  status: string,
  pendingInteraction: PendingInteraction | null,
): void {
  const items = read(agentPath);
  const idx = items.findIndex(
    (a) => a.session_key === sessionKey || `activity-${a.id}` === sessionKey,
  );
  if (idx < 0) return;
  // A settle records the interaction it ended on; `null` (turn start, or any
  // settle with none) clears it so the card stops waiting on the user.
  const next: Activity = {
    ...items[idx],
    status,
    updated_at: new Date().toISOString(),
  };
  if (pendingInteraction) next.pending_interaction = pendingInteraction;
  else delete next.pending_interaction;
  items[idx] = next;
  write(agentPath, items);
}
