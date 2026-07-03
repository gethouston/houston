/**
 * Payload validators for the conversation-list commands.
 *
 * Command payloads arrive as `unknown` (the bridge path carries untrusted JSON
 * across a serialization boundary). Each parser narrows the shape and THROWS on
 * anything malformed — never a silent default. A throw becomes an `ok: false`
 * {@link CommandResult} in `CommandRegistry.dispatch`, so a bad payload always
 * surfaces to the caller.
 */

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("conversations: payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function requireString(rec: Record<string, unknown>, key: string): string {
  const value = rec[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`conversations: "${key}" must be a non-empty string`);
  }
  return value;
}

/** Arguments for `conversations/refresh`. */
export interface RefreshPayload {
  agentId: string;
}

/** Arguments for `conversations/rename`. */
export interface RenamePayload {
  agentId: string;
  id: string;
  title: string;
}

/** Arguments for `conversations/delete`. */
export interface DeletePayload {
  agentId: string;
  id: string;
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
