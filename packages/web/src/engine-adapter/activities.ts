import type { Activity, NewActivity, ActivityUpdate } from "../../../../ui/engine-client/src/types";
import { emitEvent } from "./bus";

/**
 * The new engine has no "activity / mission" concept, but the desktop board is
 * built around them: a chat thread is an Activity, keyed by `session_key`. We
 * persist activities locally (one bucket per agentPath) so the board works and
 * survives reloads. Each activity's `session_key` is the new engine's
 * conversation id.
 */
const KEY = "houston.web.activities";

type Store = Record<string, Activity[]>;

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}
function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage disabled */
  }
}

export function listActivities(agentPath: string): Activity[] {
  return load()[agentPath] ?? [];
}

export function createActivity(agentPath: string, input: NewActivity): Activity {
  const id = crypto.randomUUID();
  const activity: Activity = {
    id,
    title: input.title || "New chat",
    description: input.description ?? "",
    status: "needs_you",
    session_key: `activity-${id}`,
    agent: input.agent,
    worktree_path: input.worktree_path ?? null,
    provider: input.provider,
    model: input.model,
    updated_at: new Date().toISOString(),
  };
  const store = load();
  store[agentPath] = [activity, ...(store[agentPath] ?? [])];
  save(store);
  emitEvent("ActivityChanged", { agent_path: agentPath });
  return activity;
}

export function updateActivity(agentPath: string, id: string, updates: ActivityUpdate): Activity {
  const store = load();
  const list = store[agentPath] ?? [];
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error(`activity ${id} not found`);
  const next: Activity = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
  list[idx] = next;
  store[agentPath] = list;
  save(store);
  emitEvent("ActivityChanged", { agent_path: agentPath });
  return next;
}

export function deleteActivity(agentPath: string, id: string): void {
  const store = load();
  store[agentPath] = (store[agentPath] ?? []).filter((a) => a.id !== id);
  save(store);
  emitEvent("ActivityChanged", { agent_path: agentPath });
}

/** Set an activity's status by its session_key (used by the turn lifecycle). */
export function setStatusBySessionKey(agentPath: string, sessionKey: string, status: string): void {
  const store = load();
  const list = store[agentPath] ?? [];
  const idx = list.findIndex((a) => a.session_key === sessionKey);
  if (idx < 0) return;
  list[idx] = { ...list[idx], status, updated_at: new Date().toISOString() };
  store[agentPath] = list;
  save(store);
  emitEvent("ActivityChanged", { agent_path: agentPath });
}
