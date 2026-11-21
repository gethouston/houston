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

export function renameWorkspaceEntry(
  agentId: string,
  rel: string,
  newName: string,
): "renamed" | "taken" {
  const parent = rel.includes("/")
    ? rel.slice(0, rel.lastIndexOf("/") + 1)
    : "";
  const to = `${parent}${newName}`;
  if (to === rel) return "renamed";
  if (workspacePathTaken(agentId, to)) return "taken";
  moveKeys(agentId, rel, to);
  return "renamed";
}

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
