import {
  DEFAULT_HEARTBEAT_SETTINGS,
  type HeartbeatLast,
  HeartbeatLastSchema,
  type HeartbeatSettingsPatch,
  type HeartbeatState,
  HeartbeatTimeSchema,
} from "@houston/protocol";
import { withDocLock } from "./doc-lock";
import { PREFERENCES_NAMESPACE } from "./preferences";
import { loadJson, saveJson, type TextStore } from "./store";

export const heartbeatDocKey = (workspaceId: string) =>
  `${PREFERENCES_NAMESPACE}/${workspaceId}/heartbeat.json`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface HeartbeatPending {
  nonce: string;
  at: string;
  seen: string[];
}

export interface HeartbeatDoc extends HeartbeatState {
  seen: string[];
  pending: HeartbeatPending | null;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];

function normalizePending(raw: unknown): HeartbeatPending | null {
  if (!isRecord(raw)) return null;
  const { nonce, at, seen } = raw;
  if (typeof nonce !== "string" || typeof at !== "string") return null;
  return { nonce, at, seen: strings(seen) };
}

export function normalizeHeartbeat(raw: unknown): HeartbeatDoc {
  const doc = isRecord(raw) ? raw : {};
  const time = HeartbeatTimeSchema.safeParse(doc.time);
  const last = HeartbeatLastSchema.safeParse(doc.last);
  return {
    enabled:
      typeof doc.enabled === "boolean"
        ? doc.enabled
        : DEFAULT_HEARTBEAT_SETTINGS.enabled,
    time: time.success ? time.data : DEFAULT_HEARTBEAT_SETTINGS.time,
    last: last.success ? last.data : null,
    seen: strings(doc.seen),
    pending: normalizePending(doc.pending),
  };
}

const toState = ({ enabled, time, last }: HeartbeatDoc): HeartbeatState => ({
  enabled,
  time,
  last,
});

export async function loadHeartbeatDoc(
  store: TextStore,
  workspaceId: string,
): Promise<HeartbeatDoc> {
  return normalizeHeartbeat(
    await loadJson<unknown>(store, heartbeatDocKey(workspaceId), null),
  );
}

export async function loadHeartbeat(
  store: TextStore,
  workspaceId: string,
): Promise<HeartbeatState> {
  return toState(await loadHeartbeatDoc(store, workspaceId));
}

export function updateHeartbeatDoc(
  store: TextStore,
  workspaceId: string,
  edit: (current: HeartbeatDoc) => HeartbeatDoc | null,
): Promise<HeartbeatDoc | null> {
  const key = heartbeatDocKey(workspaceId);
  return withDocLock(key, async () => {
    const next = edit(await loadHeartbeatDoc(store, workspaceId));
    if (next) await saveJson(store, key, next);
    return next;
  });
}

async function updateHeartbeat(
  store: TextStore,
  workspaceId: string,
  edit: (current: HeartbeatDoc) => HeartbeatDoc,
): Promise<HeartbeatState> {
  return toState(
    (await updateHeartbeatDoc(store, workspaceId, edit)) as HeartbeatDoc,
  );
}

export function setHeartbeatSettings(
  store: TextStore,
  workspaceId: string,
  patch: HeartbeatSettingsPatch,
): Promise<HeartbeatState> {
  return updateHeartbeat(store, workspaceId, (current) => ({
    ...current,
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.time !== undefined ? { time: patch.time } : {}),
  }));
}

export function recordHeartbeatRun(
  store: TextStore,
  workspaceId: string,
  last: HeartbeatLast,
): Promise<HeartbeatState> {
  return updateHeartbeat(store, workspaceId, (current) => ({
    ...current,
    last,
  }));
}
