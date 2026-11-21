import { emitDomain, state } from "./state-store";

interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  date_modified?: number;
  date_created?: number;
}

export interface WorkspaceFile {
  bytes: Buffer;
  created: number;
  modified: number;
}

const KEEP = ".keep";
export const workspaceKey = (agentId: string, rel: string) =>
  `${agentId}:${rel}`;
const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
};

function entries(agentId: string): [string, WorkspaceFile][] {
  const prefix = `${agentId}:`;
  return [...state.workspace.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => [k.slice(prefix.length), v]);
}

export function writeWorkspaceFile(
  agentId: string,
  rel: string,
  bytes: Buffer,
  ts: number,
): void {
  const existing = state.workspace.get(workspaceKey(agentId, rel));
  state.workspace.set(workspaceKey(agentId, rel), {
    bytes,
    created: existing?.created ?? ts,
    modified: ts,
  });
}

export function listWorkspaceFiles(agentId: string): ProjectFile[] {
  const out: ProjectFile[] = [];
  const dirs = new Map<string, { updated: number; created: number }>();
  for (const [rel, f] of entries(agentId)) {
    const segments = rel.split("/");
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join("/");
      const cur = dirs.get(dir) ?? { updated: 0, created: f.created };
      cur.updated = Math.max(cur.updated, f.modified);
      cur.created = Math.min(cur.created, f.created);
      dirs.set(dir, cur);
    }
    const name = segments[segments.length - 1] ?? "";
    if (name === KEEP) continue;
    out.push({
      path: rel,
      name,
      extension: extOf(name),
      size: f.bytes.length,
      is_directory: false,
      date_modified: f.modified,
      date_created: f.created,
    });
  }
  for (const [dir, meta] of dirs) {
    out.push({
      path: dir,
      name: dir.split("/").pop() ?? "",
      extension: "",
      size: 0,
      is_directory: true,
      date_modified: meta.updated,
      date_created: meta.created,
    });
  }
  return out.sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}

export function readWorkspaceFile(
  agentId: string,
  rel: string,
): WorkspaceFile | undefined {
  return state.workspace.get(workspaceKey(agentId, rel));
}

export function importWorkspaceFiles(
  agentId: string,
  dir: string | null,
  files: { name: string; contentBase64: string; relPath?: string }[],
): string[] {
  const now = Date.now();
  const paths: string[] = [];
  for (const f of files) {
    const name = f.relPath ?? f.name;
    let rel = dir ? `${dir}/${name}` : name;
    const dot = rel.lastIndexOf(".");
    for (let n = 1; state.workspace.has(workspaceKey(agentId, rel)); n++) {
      const stem = dot > 0 ? rel.slice(0, dot) : rel;
      const ext = dot > 0 ? rel.slice(dot) : "";
      rel = `${stem} (${n})${ext}`;
    }
    writeWorkspaceFile(
      agentId,
      rel,
      Buffer.from(f.contentBase64, "base64"),
      now,
    );
    paths.push(rel);
  }
  emitDomain("FilesChanged", agentId);
  return paths;
}

export function workspacePathTaken(agentId: string, rel: string): boolean {
  if (state.workspace.has(workspaceKey(agentId, rel))) return true;
  const prefix = `${workspaceKey(agentId, rel)}/`;
  for (const k of state.workspace.keys()) if (k.startsWith(prefix)) return true;
  return false;
}

export type NameResult<T> = { kind: "ok"; value: T } | { kind: "taken" };

export function createWorkspaceFolder(
  agentId: string,
  folder: string,
): NameResult<string> {
  if (workspacePathTaken(agentId, folder)) return { kind: "taken" };
  writeWorkspaceFile(agentId, `${folder}/${KEEP}`, Buffer.alloc(0), Date.now());
  emitDomain("FilesChanged", agentId);
  return { kind: "ok", value: folder };
}
