import type { PendingInteraction, TurnMode } from "@houston/protocol";
import schema from "@houston-ai/agent-schemas/activity.schema.json";
import { activityWrites } from "./activity-writes";
import { newId, now, readAgentJson, writeAgentJson } from "./agent-file";

export const ACTIVITY_STATUSES = [
  "running",
  "needs_you",
  "done",
  "error",
  "archived",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  routine_id?: string;
  routine_run_id?: string;
  skill_slug?: string;
  updated_at?: string;
  last_message_at?: string;
  provider?: string;
  model?: string;
  mode?: TurnMode;
  origin_session_key?: string;
  pending_interaction?: PendingInteraction;
}

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  routine_id?: string;
  routine_run_id?: string;
  skill_slug?: string;
  provider?: string | null;
  model?: string | null;
  pending_interaction?: PendingInteraction | null;
}

const NAME = "activity";
const s = schema as unknown as Parameters<typeof readAgentJson>[2];

export async function list(agentPath: string): Promise<Activity[]> {
  return readAgentJson<Activity[]>(agentPath, NAME, s, []);
}

const writes = activityWrites({
  list,
  write: (agentPath, items) => writeAgentJson(agentPath, NAME, s, items),
  now,
  newId,
});

export function create(
  agentPath: string,
  title: string,
  description = "",
  agent?: string,
  provider?: string,
  model?: string,
  mode?: TurnMode,
): Promise<Activity> {
  return writes.create(
    agentPath,
    title,
    description,
    agent,
    provider,
    model,
    mode,
  );
}

export const update = writes.update;

export const remove = writes.remove;

export const bulkUpdate = writes.bulkUpdate;

export const bulkRemove = writes.bulkRemove;
