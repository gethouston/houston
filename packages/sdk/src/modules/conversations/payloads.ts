import { requireString } from "../payload";

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("conversations: payload must be an object");
  }
  return payload as Record<string, unknown>;
}

export interface RefreshPayload {
  agentId: string;
}

export interface RenamePayload {
  agentId: string;
  id: string;
  title: string;
}

export interface DeletePayload {
  agentId: string;
  id: string;
}

export interface SuggestTitlePayload {
  agentId: string;
  text: string;
}

export function parseRefresh(payload: unknown): RefreshPayload {
  const rec = asRecord(payload);
  return { agentId: requireString(rec, "agentId") };
}

export function parseRename(payload: unknown): RenamePayload {
  const rec = asRecord(payload);
  return {
    agentId: requireString(rec, "agentId"),
    id: requireString(rec, "id"),
    title: requireString(rec, "title"),
  };
}

export function parseDelete(payload: unknown): DeletePayload {
  const rec = asRecord(payload);
  return {
    agentId: requireString(rec, "agentId"),
    id: requireString(rec, "id"),
  };
}

export function parseSuggestTitle(payload: unknown): SuggestTitlePayload {
  const rec = asRecord(payload);
  return {
    agentId: requireString(rec, "agentId"),
    text: requireString(rec, "text"),
  };
}
