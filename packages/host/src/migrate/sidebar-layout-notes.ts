import type { Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";

/**
 * The GROUP.md notes a legacy layout's group contexts were mirrored into.
 * Persisted as the `sidebar_layout_legacy_notes` preference in the same write
 * that converts the layout, so the removal survives a crash or a failed delete
 * and is retried on every boot until it completes.
 */
export interface LegacyNotes {
  /** Agent id to the context its group mirrored (the last group with a
   *  context wins, as the mirror wrote it). */
  byAgent: Record<string, string>;
  /** Agents in any legacy group, which the default context never reached. */
  grouped: string[];
  defaultContext: string | null;
}

export const LEGACY_NOTES_KEY = "sidebar_layout_legacy_notes";

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/** The notes a legacy stored layout left behind, or null when it left none. */
export function legacyNotesOf(raw: unknown): LegacyNotes | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const groups = records(value.groups);
  const byAgent: Record<string, string> = {};
  const grouped: string[] = [];
  for (const group of groups) {
    const members = strings(group.agentIds);
    grouped.push(...members);
    const context = text(group.context);
    if (context) for (const id of members) byAgent[id] = context;
  }
  const defaultContext = text(value.defaultContext);
  if (Object.keys(byAgent).length === 0 && !defaultContext) return null;
  return { byAgent, grouped, defaultContext };
}

/** Parse the persisted marker; a malformed one throws so boot reports it. */
export function parseLegacyNotes(raw: string): LegacyNotes {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("legacy notes marker is not an object");
  const record = value as Record<string, unknown>;
  const byAgent =
    record.byAgent &&
    typeof record.byAgent === "object" &&
    !Array.isArray(record.byAgent)
      ? Object.fromEntries(
          Object.entries(record.byAgent).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  return {
    byAgent,
    grouped: strings(record.grouped),
    defaultContext: text(record.defaultContext),
  };
}

/**
 * Delete every agent's GROUP.md that still holds exactly the note its legacy
 * group mirrored; an edited note is the person's own and stays. Resolves true
 * only when every removal succeeded.
 */
export async function removeLegacyNotes(opts: {
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  ws: Workspace;
  notes: LegacyNotes;
  log: (message: string, error?: unknown) => void;
}): Promise<boolean> {
  const { store, vfs, paths, ws, notes, log } = opts;
  const grouped = new Set(notes.grouped);
  let complete = true;
  for (const agent of await store.listAgents(ws.id)) {
    const expected =
      notes.byAgent[agent.id] ??
      (grouped.has(agent.id) ? null : notes.defaultContext);
    if (!expected) continue;
    try {
      const key = `${paths.agentRoot(ws, agent)}/GROUP.md`;
      if ((await vfs.readText(key))?.trim() === expected)
        await vfs.deleteKey(key);
    } catch (error) {
      complete = false;
      log(`[sidebar-layout] ${agent.id}: group note removal failed`, error);
    }
  }
  return complete;
}
