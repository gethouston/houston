import { docKey, parseJsonDoc, saveJson, withDocLock } from "@houston/domain";
import type { Workspace } from "../domain/types";
import { type AgentRouteDeps, DEFAULT_PATHS } from "./agent-authz";

export async function rewriteOriginAgent(
  deps: AgentRouteDeps,
  workspace: Workspace,
  fromId: string,
  toId: string | undefined,
): Promise<void> {
  if (!deps.vfs || fromId === toId) return;
  for (const agent of await deps.store.listAgents(workspace.id)) {
    const root = (deps.paths ?? DEFAULT_PATHS).agentRoot(workspace, agent);
    const key = docKey(root, "activity");
    try {
      const changed = await withDocLock(`${root}#activity`, async () => {
        if (!deps.vfs) return false;
        const raw = await deps.vfs.readText(key);
        if (raw === null) return false;
        const parsed: unknown = parseJsonDoc(raw, key);
        if (!Array.isArray(parsed)) throw new Error(`${key} is not an array`);
        let altered = false;
        const next = parsed.map((item: unknown) => {
          if (!isRecord(item) || item.origin_agent !== fromId) return item;
          altered = true;
          const updated = { ...item };
          if (toId === undefined) delete updated.origin_agent;
          else updated.origin_agent = toId;
          return updated;
        });
        if (altered) await saveJson(deps.vfs, key, next);
        return altered;
      });
      if (changed) {
        deps.events?.emit(workspace.ownerUserId, {
          type: "ActivityChanged",
          agentPath: agent.id,
        });
      }
    } catch (error) {
      console.error(
        `[agents] origin rewrite failed for ${agent.id} at ${key}:`,
        error,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringEnd(raw: string, start: number): number {
  let escaped = false;
  for (let i = start + 1; i < raw.length; i++) {
    if (escaped) escaped = false;
    else if (raw[i] === "\\") escaped = true;
    else if (raw[i] === '"') return i + 1;
  }
  throw new Error("unterminated JSON string");
}

function valueEnd(raw: string, start: number): number {
  if (raw[start] === '"') return stringEnd(raw, start);
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '"') {
      i = stringEnd(raw, i) - 1;
      continue;
    }
    if (raw[i] === "{" || raw[i] === "[") depth++;
    else if (raw[i] === "}" || raw[i] === "]") {
      if (depth === 0) return i;
      if (--depth === 0) return i + 1;
    } else if (raw[i] === "," && depth === 0) return i;
  }
  return raw.length;
}

function entry(raw: string, objectStart: number, name: string) {
  let at = objectStart + 1;
  while (at < raw.length) {
    while (/[,\s]/.test(raw[at] ?? "")) at++;
    if (raw[at] === "}") return null;
    const keyStart = at;
    const keyEnd = stringEnd(raw, at);
    const key = JSON.parse(raw.slice(at, keyEnd)) as string;
    at = raw.indexOf(":", keyEnd) + 1;
    while (/\s/.test(raw[at] ?? "")) at++;
    const valueStart = at;
    const end = valueEnd(raw, at);
    if (key === name) return { keyStart, valueStart, end };
    at = end;
  }
  return null;
}

export function editRawAgentEntry(
  raw: string,
  agentId: string,
  policy: unknown | null,
): string {
  const root = entry(raw, raw.indexOf("{"), "agents");
  if (!root) throw new Error("delegation agents object missing");
  const found = entry(raw, root.valueStart, agentId);
  if (found && policy)
    return (
      raw.slice(0, found.valueStart) +
      JSON.stringify(policy) +
      raw.slice(found.end)
    );
  if (found) {
    const before = raw.slice(0, found.keyStart);
    const after = raw.slice(found.end);
    const comma = before.trimEnd().endsWith(",") ? before.lastIndexOf(",") : -1;
    if (comma >= 0) return before.slice(0, comma) + after;
    return before + after.replace(/^\s*,/, "");
  }
  if (!policy) return raw;
  const close = valueEnd(raw, root.valueStart) - 1;
  const comma = raw.slice(root.valueStart + 1, close).trim() ? "," : "";
  return (
    raw.slice(0, close) +
    comma +
    JSON.stringify(agentId) +
    ":" +
    JSON.stringify(policy) +
    raw.slice(close)
  );
}
