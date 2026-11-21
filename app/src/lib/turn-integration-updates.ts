import type { ToolEntry } from "@houston-ai/chat";
import {
  asRecord,
  externalUrlOf,
  synthesizedUrl,
} from "./integration-artifact-url.ts";
import {
  integrationExecuteSucceeded,
  isIntegrationExecuteCall,
} from "./integration-execute.ts";

export interface TurnIntegrationUpdate {
  kind: "integration";
  action: string;
  url?: string;
}

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

function toSnakeTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[._-]/)
    .filter(Boolean);
}

export function isExternalWriteAction(action: string): boolean {
  const subject = action.startsWith("tools.")
    ? (action.split(".").at(-1) ?? "")
    : action;
  return toSnakeTokens(subject).some((t) => WRITE_VERBS.has(t));
}

export function integrationUpdatesOf(
  tools: ToolEntry[],
): TurnIntegrationUpdate[] {
  const updates: TurnIntegrationUpdate[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!isIntegrationExecuteCall(tool.name)) continue;
    if (!tool.result || !integrationExecuteSucceeded(tool.result)) continue;
    const input = asRecord(tool.input);
    const action = input.action;
    if (typeof action !== "string" || !isExternalWriteAction(action)) continue;
    let data: Record<string, unknown> = {};
    try {
      data = asRecord(JSON.parse(tool.result.content));
    } catch {}
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
