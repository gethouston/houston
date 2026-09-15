/**
 * Deletes, renames and moves over the agent's WORKSPACE files (state-workspace.ts
 * holds the store, listing and uploads). Mirrors the real host's `turn/files-ops.ts`
 * and `turn/files-move.ts`: prefix deletes/moves, and a rename that refuses a
 * name already in use instead of clobbering it.
 */

import { emitDomain, state } from "./state-store";
import {
  workspaceKey as key,
  type NameResult,
  workspacePathTaken,
} from "./state-workspace";

export function deleteWorkspaceEntry(agentId: string, rel: string): void {
  state.workspace.delete(key(agentId, rel));
  for (const k of [...state.workspace.keys()]) {
    if (k.startsWith(`${key(agentId, rel)}/`)) state.workspace.delete(k);
  }
  emitDomain("FilesChanged", agentId);
}

/**
 * Rename inside the item's own folder. Refuses a name already in use instead
 * of clobbering it, exactly like the real host's `renameWorkspaceFile`: a
 * folder counts as taken too, since it exists only through its children's
 * keys. The route turns "taken" into the host's 409.
 */
export function renameWorkspaceEntry(
  agentId: string,
  rel: string,
  newName: string,
): "renamed" | "taken" {
  const parent = rel.includes("/")
    ? rel.slice(0, rel.lastIndexOf("/") + 1)
    : "";
  const to = `${parent}${newName}`;
  if (to === rel) return "renamed"; // the name it already has
  if (workspacePathTaken(agentId, to)) return "taken";
  moveKeys(agentId, rel, to);
  return "renamed";
}

/**
 * Move a file/folder into `toDir` (null = root), keeping its name. Refuses a
 * destination already in use rather than clobbering it, like the real host's
 * `moveWorkspaceEntry`.
 */
export function moveWorkspaceEntry(
  agentId: string,
  rel: string,
  toDir: string | null,
): NameResult<string> {
  const name = rel.split("/").pop() ?? "";
  const to = toDir ? `${toDir}/${name}` : name;
  if (to !== rel && workspacePathTaken(agentId, to)) return { kind: "taken" };
  moveKeys(agentId, rel, to);
  return { kind: "ok", value: to };
}

function moveKeys(agentId: string, from: string, to: string): void {
  const exact = state.workspace.get(key(agentId, from));
  if (exact) {
    state.workspace.delete(key(agentId, from));
    state.workspace.set(key(agentId, to), exact);
  }
  for (const k of [...state.workspace.keys()]) {
    const prefix = `${key(agentId, from)}/`;
    if (k.startsWith(prefix)) {
      const v = state.workspace.get(k);
      state.workspace.delete(k);
      if (v)
        state.workspace.set(`${key(agentId, to)}/${k.slice(prefix.length)}`, v);
    }
  }
  emitDomain("FilesChanged", agentId);
}
