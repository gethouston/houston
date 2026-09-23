/**
 * Untrusted command-payload parsers for the activities module. The dispatch
 * path hands these raw JSON; each parser throws on a bad shape
 * (`CommandRegistry.dispatch` turns the throw into an `ok: false` result).
 */

import { requireString } from "../payload";

/** Pull a required non-empty string off an untrusted command payload. */

/** Pull an optional string off an untrusted command payload. */
function optionalString(payload: unknown, key: string): string | undefined {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  return typeof value === "string" ? value : undefined;
}

export interface RefreshArgs {
  agentId: string;
}
export interface CreateArgs {
  agentId: string;
  title: string;
  description?: string;
}
export interface SetStatusArgs {
  agentId: string;
  id: string;
  status: string;
}
export interface RenameArgs {
  agentId: string;
  id: string;
  title: string;
}
export interface DeleteArgs {
  agentId: string;
  id: string;
}

export const parseRefresh = (p: unknown): RefreshArgs => ({
  agentId: requireString(p, "agentId"),
});
export const parseCreate = (p: unknown): CreateArgs => ({
  agentId: requireString(p, "agentId"),
  title: requireString(p, "title"),
  description: optionalString(p, "description"),
});
export const parseSetStatus = (p: unknown): SetStatusArgs => ({
  agentId: requireString(p, "agentId"),
  id: requireString(p, "id"),
  status: requireString(p, "status"),
});
export const parseRename = (p: unknown): RenameArgs => ({
  agentId: requireString(p, "agentId"),
  id: requireString(p, "id"),
  title: requireString(p, "title"),
});
export const parseDelete = (p: unknown): DeleteArgs => ({
  agentId: requireString(p, "agentId"),
  id: requireString(p, "id"),
});
