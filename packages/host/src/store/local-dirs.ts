import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PREFERENCES_NAMESPACE } from "@houston/domain";

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function listDirs(p: string): string[] {
  if (!existsSync(p)) return [];
  return readdirSync(p)
    .filter((name) => !name.startsWith(".") && isDir(join(p, name)))
    .sort();
}

export const isWorkspaceDirName = (name: string) =>
  name !== PREFERENCES_NAMESPACE;

export function listWorkspaceDirs(root: string): string[] {
  return listDirs(root).filter(isWorkspaceDirName);
}

export function listAgentDirs(root: string): string[] {
  return listWorkspaceDirs(root).flatMap((ws) =>
    listDirs(join(root, ws)).map((agent) => join(root, ws, agent)),
  );
}
