import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, posix, sep } from "node:path";
import { VfsReadLimitError } from "../vfs";
import {
  FileArgumentError,
  MAX_FILE_ARG_BYTES,
  type WorkspaceFile,
} from "./file-staging";

export interface AgentFiles {
  dir: string;
  rootKey: string;
  ready?: Promise<void>;
  fallback?: (rel: string, maxBytes: number) => Promise<Buffer | null>;
}

const outside = (path: string) =>
  new FileArgumentError(
    `"${path}" is outside this agent's files. Only files in your workspace can be sent to apps: save or copy the file into your workspace first, then retry with its path.`,
  );

export function workspaceRelFor(files: AgentFiles, path: string): string {
  const given = path.trim().replace(/\\/g, "/");
  let rel = given;
  const drive = /^[A-Za-z]:\//.test(given);
  if (given.startsWith("/") || drive) {
    const dir = files.dir.replace(/\\/g, "/").replace(/\/+$/, "");
    const marker = `/${files.rootKey}/`;
    const at = given.indexOf(marker);
    const fold = (p: string) => (drive ? p.toLowerCase() : p);
    rel = fold(given).startsWith(fold(`${dir}/`))
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
