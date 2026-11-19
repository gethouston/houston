import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, posix, sep } from "node:path";
import { VfsReadLimitError } from "../vfs";
import {
  FileArgumentError,
  MAX_FILE_ARG_BYTES,
  type WorkspaceFile,
} from "./file-staging";

/** Where one agent's files are, for reading the paths it passes. */
export interface AgentFiles {
  /** The agent's folder on disk. */
  dir: string;
  /** Its key under the workspaces root ("<Workspace>/<Agent>"): an absolute
   *  path from another root of the same agent (an earlier turn's
   *  `/work/houston-turn-…/store/workspaces/<key>/…`) is found by it. */
  rootKey: string;
  /** Resolves once every file of the agent is on disk (deferred hydration). */
  ready?: Promise<void>;
  /** Reads a path relative to `dir` that is not on disk: a lazy turn tree
   *  fetches it from the store. */
  fallback?: (rel: string, maxBytes: number) => Promise<Buffer | null>;
}

const outside = (path: string) =>
  new FileArgumentError(
    `"${path}" is outside this agent's files. Only files in your workspace can be sent to apps: save or copy the file into your workspace first, then retry with its path.`,
  );

/** The path relative to the agent's folder, or a FileArgumentError. */
export function workspaceRelFor(files: AgentFiles, path: string): string {
  const given = path.trim().replace(/\\/g, "/");
  let rel = given;
  if (given.startsWith("/")) {
    const dir = files.dir.replace(/\\/g, "/").replace(/\/+$/, "");
    const marker = `/${files.rootKey}/`;
    const at = given.indexOf(marker);
    rel = given.startsWith(`${dir}/`)
      ? given.slice(dir.length + 1)
      : at < 0
        ? ""
        : given.slice(at + marker.length);
  }
  rel = rel ? posix.normalize(rel) : "";
  if (!rel || rel === "." || rel === ".." || rel.startsWith("../")) {
    throw outside(path);
  }
  return rel;
}

const code = (err: unknown) =>
  err instanceof Error && "code" in err ? err.code : undefined;

const tooLarge = (path: string) =>
  new FileArgumentError(
    `The file "${path}" is larger than ${MAX_FILE_ARG_BYTES / 1024 / 1024} MB, the most Houston can send to an app. Tell the user it is too large to send this way, and do not retry it.`,
  );

/**
 * Reads agent-supplied paths for upload. Only a regular file whose REAL path is
 * inside the agent's folder is read: a link that leads anywhere else, a link
 * to nothing, a folder or a device is refused, and the final open refuses a
 * link swapped in after the check.
 */
export function agentFileReader(files: AgentFiles) {
  let realDir: Promise<string> | undefined;
  return async (path: string): Promise<WorkspaceFile | null> => {
    const rel = workspaceRelFor(files, path);
    await files.ready;
    const name = posix.basename(rel);
    const target = join(files.dir, ...rel.split("/"));
    const linkStat = await lstat(target).catch((err: unknown) => {
      if (code(err) === "ENOENT" || code(err) === "ENOTDIR") return null;
      throw err;
    });
    if (!linkStat) {
      if (!files.fallback) return null;
      try {
        const bytes = await files.fallback(rel, MAX_FILE_ARG_BYTES);
        return bytes ? { name, bytes } : null;
      } catch (err) {
        if (err instanceof VfsReadLimitError) throw tooLarge(path);
        throw err;
      }
    }
    realDir ??= realpath(files.dir);
    const real = await realpath(target).catch((err: unknown) => {
      if (code(err) === "ENOENT" || code(err) === "ELOOP") return null;
      throw err;
    });
    if (!real?.startsWith(`${await realDir}${sep}`)) {
      throw outside(path);
    }
    const handle = await open(
      real,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch((err: unknown) => {
      if (code(err) === "ELOOP") throw outside(path);
      if (code(err) === "EISDIR") return null;
      throw err;
    });
    if (!handle) throw notAFile(path);
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw notAFile(path);
      if (stat.size > MAX_FILE_ARG_BYTES) throw tooLarge(path);
      const bytes = Buffer.alloc(stat.size);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(
          bytes,
          length,
          bytes.length - length,
          null,
        );
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      return { name, bytes: bytes.subarray(0, length) };
    } finally {
      await handle.close();
    }
  };
}

const notAFile = (path: string) =>
  new FileArgumentError(
    `"${path}" is a folder or special file, not a regular file. Pass the path of one file.`,
  );
