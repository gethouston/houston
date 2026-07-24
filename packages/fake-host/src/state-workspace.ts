/**
 * The agent's WORKSPACE files — what the Files tab lists, uploads into, moves,
 * renames, deletes, and downloads. Distinct from the `.houston/**` files-first
 * store (state-agents.ts): this models the real host's `turn/files*.ts` surface
 * (list with synthesized folders + dates, Finder-style upload dedupe, `.keep`
 * folder markers, prefix deletes/moves) faithfully enough for UI tests.
 */

import { emitDomain, state } from "./state-store";

/** The v3 files-listing wire shape (host `turn/files-ops.ts` ProjectFile). */
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
const key = (agentId: string, rel: string) => `${agentId}:${rel}`;
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
  const existing = state.workspace.get(key(agentId, rel));
  state.workspace.set(key(agentId, rel), {
    bytes,
    created: existing?.created ?? ts,
    modified: ts,
  });
}

/** Files + synthesized folder rows, exactly the shape the real host lists. */
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
  return state.workspace.get(key(agentId, rel));
}

/** Finder-style upload: never overwrite, suffix " (n)" instead. */
export function importWorkspaceFiles(
  agentId: string,
  dir: string | null,
  files: { name: string; contentBase64: string; relPath?: string }[],
): string[] {
  const now = Date.now();
  const paths: string[] = [];
  for (const f of files) {
    // Folder uploads (HOU-889) send the folder-relative path; nested keys
    // synthesize their directory rows in listWorkspaceFiles, like the real host.
    const name = f.relPath ?? f.name;
    let rel = dir ? `${dir}/${name}` : name;
    const dot = rel.lastIndexOf(".");
    for (let n = 1; state.workspace.has(key(agentId, rel)); n++) {
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

/** Delete a file, or a folder with everything under it. */
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
): void {
  const parent = rel.includes("/")
    ? rel.slice(0, rel.lastIndexOf("/") + 1)
    : "";
  moveKeys(agentId, rel, `${parent}${newName}`);
}

/** Move a file/folder into `toDir` (null = root), keeping its name. */
export function moveWorkspaceEntry(
  agentId: string,
  rel: string,
  toDir: string | null,
): string {
  const name = rel.split("/").pop() ?? "";
  const to = toDir ? `${toDir}/${name}` : name;
  moveKeys(agentId, rel, to);
  return to;
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

export function createWorkspaceFolder(agentId: string, folder: string): string {
  writeWorkspaceFile(agentId, `${folder}/${KEEP}`, Buffer.alloc(0), Date.now());
  emitDomain("FilesChanged", agentId);
  return folder;
}
