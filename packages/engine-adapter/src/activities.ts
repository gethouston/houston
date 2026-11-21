import {
  addressesMission,
  missionConversationId,
  missionConversationKey,
} from "@houston/domain";
import type { ActivityStamp } from "@houston/protocol";
import type {
  Activity,
  ActivityUpdate,
  ConversationEntry,
  NewActivity,
  PendingInteraction,
} from "@houston/wire-types";
import { readAgentFile, writeAgentFile } from "./agent-files";

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
    session_key: missionConversationKey(a),
    updated_at: a.updated_at,
    last_message_at: a.last_message_at,
    agent_path: agentPath,
    agent_name: agentName,
    agent: a.agent,
    routine_id: a.routine_id,
    ...(a.provider !== undefined && { provider: a.provider }),
    ...(a.model !== undefined && { model: a.model }),
    ...(a.mode !== undefined && { mode: a.mode }),
    ...(a.origin_session_key !== undefined && {
      origin_session_key: a.origin_session_key,
    }),
    ...(a.origin_agent !== undefined && { origin_agent: a.origin_agent }),
    ...(a.started_by !== undefined && { started_by: a.started_by }),
    ...(a.created_by !== undefined && { created_by: a.created_by }),
    ...(a.contributors !== undefined && { contributors: a.contributors }),
    ...(a.mentioned !== undefined && { mentioned: a.mentioned }),
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
    session_key: missionConversationId(id),
    agent: input.agent,
    provider: input.provider,
    model: input.model,
    ...(input.mode !== undefined && { mode: input.mode }),
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
  const { pending_interaction, provider, model, ...rest } = updates;
  const next: Activity = {
    ...items[idx],
    ...rest,
    updated_at: new Date().toISOString(),
  };
  if (provider === null) delete next.provider;
  else if (provider !== undefined) next.provider = provider;
  if (model === null) delete next.model;
  else if (model !== undefined) next.model = model;
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

export function setStatusBySessionKey(
  agentPath: string,
  sessionKey: string,
  status: string,
  pendingInteraction: PendingInteraction | null,
  stamp?: ActivityStamp,
): void {
  const items = read(agentPath);
  const idx = items.findIndex((a) => addressesMission(a, sessionKey));
  if (idx < 0) return;
  const next: Activity = {
    ...items[idx],
    status,
    updated_at: new Date().toISOString(),
  };
  if (stamp === "last_message") next.last_message_at = next.updated_at;
  if (pendingInteraction) next.pending_interaction = pendingInteraction;
  else delete next.pending_interaction;
  items[idx] = next;
  write(agentPath, items);
}
