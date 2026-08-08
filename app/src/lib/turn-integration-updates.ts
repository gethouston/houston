import type { ToolEntry } from "@houston-ai/chat";
import {
  asRecord,
  externalUrlOf,
  synthesizedUrl,
} from "./integration-artifact-url.ts";

/**
 * External-artifact rows for the turn-end "Updates made" summary
 * (PRODUCT-1196): every successful `integration_execute` WRITE action (sent an
 * email, edited a sheet, updated a record...) becomes a reviewable row, with a
 * click-through URL whenever the action's result (or its parameters) can name
 * one. Read actions (fetch/list/search) never appear — the summary reviews
 * what the agent CHANGED in the outside world, not what it looked at.
 *
 * Pure and DOM-free so the app's node:test suite covers it directly.
 */
export interface TurnIntegrationUpdate {
  kind: "integration";
  /** The action slug exactly as executed (Composio slug or custom executor
   *  address) — the brand resolver turns it into `Gmail · Sent email`. */
  action: string;
  /** The external artifact, when the result named one. Absent = a plain row. */
  url?: string;
}

// Mutation verbs. An action counts as an external WRITE when any
// underscore-separated token of its slug is one of these — token-scanned (not
// prefix-stripped) because the toolkit catalog is not available here to strip
// the app prefix ("GOOGLESHEETS_BATCH_UPDATE" hits via "update").
const WRITE_VERBS = new Set([
  "send",
  "create",
  "update",
  "delete",
  "remove",
  "add",
  "insert",
  "append",
  "upload",
  "write",
  "edit",
  "set",
  "move",
  "reply",
  "post",
  "forward",
  "archive",
  "publish",
  "submit",
  "schedule",
  "invite",
  "share",
  "assign",
  "complete",
  "cancel",
  "rename",
  "duplicate",
  "copy",
  "star",
  "upsert",
  "patch",
  "modify",
  "merge",
  "trash",
]);

/** "listJobs" → "list_jobs", so a custom executor tool name token-scans the
 *  same way a Composio slug does. */
function toSnakeTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[._-]/)
    .filter(Boolean);
}

/** True when the action mutates an external artifact. Handles both grammars:
 *  a Composio slug (`GMAIL_SEND_EMAIL`) and a custom executor address
 *  (`tools.<slug>.<owner>.<connection>...<tool>`, scanned by its tool name). */
export function isExternalWriteAction(action: string): boolean {
  const subject = action.startsWith("tools.")
    ? (action.split(".").at(-1) ?? "")
    : action;
  return toSnakeTokens(subject).some((t) => WRITE_VERBS.has(t));
}

/**
 * The external-artifact rows of a turn. Only SUCCESSFUL write actions qualify;
 * the execute tool also returns non-error guidance texts (app turned off,
 * stale slug) — those are prose, never the `{`/`[` JSON (or bare "Done.") a
 * real success emits, so they are filtered by shape. Identical (action, url)
 * repeats collapse into one row; distinct artifacts keep their own.
 */
export function integrationUpdatesOf(
  tools: ToolEntry[],
): TurnIntegrationUpdate[] {
  const updates: TurnIntegrationUpdate[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!tool.result || tool.result.is_error) continue;
    const short = tool.name.includes("__")
      ? (tool.name.split("__").at(-1) ?? tool.name)
      : tool.name;
    if (short !== "integration_execute") continue;
    const input = asRecord(tool.input);
    const action = input.action;
    if (typeof action !== "string" || !isExternalWriteAction(action)) continue;
    const content = tool.result.content.trimStart();
    const succeeded =
      content.startsWith("{") || content.startsWith("[") || content === "Done.";
    if (!succeeded) continue;
    let data: Record<string, unknown> = {};
    try {
      data = asRecord(JSON.parse(tool.result.content));
    } catch {
      // Truncated payload: URL extraction falls back to a raw-text scan and
      // synthesis works from the action's params alone.
    }
    const url =
      externalUrlOf(tool.result.content) ??
      synthesizedUrl(action, asRecord(input.params), data);
    const key = `${action}|${url ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    updates.push({ kind: "integration", action, ...(url ? { url } : {}) });
  }
  return updates;
}
