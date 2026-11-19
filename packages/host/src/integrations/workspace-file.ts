import { posix } from "node:path";
import { type Vfs, VfsReadLimitError } from "../vfs";
import {
  FileArgumentError,
  MAX_FILE_ARG_BYTES,
  type WorkspaceFile,
} from "./file-staging";

/**
 * Where an agent-supplied path lives in the Vfs. Agents pass a path relative to
 * their workspace ("reports/q3.pdf") or the absolute one their runtime sees,
 * which is `<workspaces root>/<agentRoot>/<path>` on every host (a desktop
 * home dir, a cloud turn's `/work/houston-turn-…/store/workspaces`), so the
 * agent root's own segments mark where the workspace path starts.
 */
export function workspaceKeyFor(agentRoot: string, path: string): string {
  const given = path.trim().replace(/\\/g, "/");
  let rel = given;
  if (given.startsWith("/")) {
    const marker = `/${agentRoot}/`;
    const at = given.indexOf(marker);
    rel = at < 0 ? "" : given.slice(at + marker.length);
  }
  rel = rel ? posix.normalize(rel) : "";
  if (!rel || rel === "." || rel === ".." || rel.startsWith("../")) {
    throw new FileArgumentError(
      `"${path}" is outside your workspace. Only files in your workspace can be sent to apps: save or copy the file into your workspace first, then retry with its path.`,
    );
  }
  return `${agentRoot}/${rel}`;
}

/** Reads agent-supplied paths from one agent's workspace for upload. */
export function workspaceFileReader(vfs: Vfs, agentRoot: string) {
  return async (path: string): Promise<WorkspaceFile | null> => {
    const key = workspaceKeyFor(agentRoot, path);
    let bytes: Buffer | null;
    try {
      bytes = await vfs.readBytes(key, MAX_FILE_ARG_BYTES);
    } catch (err) {
      if (err instanceof VfsReadLimitError) {
        throw new FileArgumentError(
          `The file "${path}" is larger than ${MAX_FILE_ARG_BYTES / 1024 / 1024} MB, the most Houston can send to an app. Tell the user it is too large to send this way, and do not retry it.`,
        );
      }
      if (err instanceof Error && "code" in err && err.code === "EISDIR") {
        throw new FileArgumentError(
          `"${path}" is a folder, not a file. Pass the path of one file.`,
        );
      }
      throw err;
    }
    if (!bytes) return null;
    return { name: posix.basename(key), bytes };
  };
}
