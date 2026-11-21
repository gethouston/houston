import { posix } from "node:path";
import type { FileOpCode } from "@houston/protocol";

export class FilePathError extends Error {
  constructor(rel: string) {
    super(`invalid workspace path: ${rel}`);
    this.name = "FilePathError";
  }
}

export class FileOpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: FileOpCode,
  ) {
    super(message);
    this.name = "FileOpError";
  }
}

export function safeRel(rel: string): string {
  const cleaned = rel.replace(/\\/g, "/");
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned))
    throw new FilePathError(rel);
  const norm = posix.normalize(cleaned);
  if (
    norm === "" ||
    norm === "." ||
    norm.startsWith("..") ||
    norm.split("/").includes("..")
  ) {
    throw new FilePathError(rel);
  }
  if (norm.split("/")[0]?.startsWith(".")) throw new FilePathError(rel);
  return norm;
}

export function workspaceRel(root: string, raw: string): string {
  const cleaned = raw.replace(/\\/g, "/");
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned)) {
    const marker = `/${root}/`;
    const at = cleaned.indexOf(marker);
    if (at !== -1) return safeRel(cleaned.slice(at + marker.length));
  }
  return safeRel(raw);
}

export const fileKey = (root: string, rel: string) => `${root}/${rel}`;
export const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
};
