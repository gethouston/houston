/**
 * The files module — an agent's REAL workspace: what is in it, what one file
 * says, and every rearrangement of it, plus the two upload routes that put new
 * bytes there.
 *
 * These are pure commands: the Files section opens them, reads once, and writes
 * from a menu; no host event invalidates the listing and nothing renders it
 * continuously, so there is no reactive scope to publish. The same handlers
 * back both the typed facade and the bridge `dispatch` path.
 *
 * SEAM — per-agent, but NOT through `clientFor(agentId)`. The runtime client is
 * scoped to one conversation and serves none of the `/agents/:id/files*`
 * family, so the module talks to those host routes through the SDK's own HTTP
 * seam. A 401 routes through the shared {@link ModuleContext.authExpiry}
 * notifier, which that seam signals.
 *
 * Degradations are the CALLER's: every request here throws on a non-2xx, so a
 * deployment with no workspace to serve says so and the surface — not this
 * layer — decides whether that reads as an empty Files section or a failure.
 */

import type { ModuleContext } from "../../module-context";
import type { HttpScope } from "../http";
import {
  createFolder,
  deleteFile,
  FilesHttpError,
  listProjectFiles,
  moveProjectFile,
  readProjectFile,
  renameFile,
} from "./http";
import {
  FilesCommand,
  type FileUpload,
  nullableString,
  type ProjectFile,
  requireString,
  requireUploads,
} from "./types";
import { saveAttachments, uploadProjectFiles } from "./uploads";

export { FilesHttpError } from "./http";
export type {
  FilesCommandType,
  FileUpload,
  ProjectFile,
} from "./types";
export { FilesCommand } from "./types";

/** The typed facade for an agent's workspace files. Every call throws on a non-2xx. */
export interface FilesModule {
  /** Everything in the agent's workspace, one entry per file and folder. */
  listProjectFiles(agentPath: string): Promise<ProjectFile[]>;
  /** One workspace file's contents, base64-framed bytes decoded to text. */
  readProjectFile(agentPath: string, relPath: string): Promise<string>;
  /** Permanently delete one workspace file or folder. */
  deleteFile(agentPath: string, relPath: string): Promise<void>;
  /** Rename one workspace entry in place; the folder it sits in never changes. */
  renameFile(
    agentPath: string,
    relPath: string,
    newName: string,
  ): Promise<void>;
  /** Create an empty folder; answers the path it was created at. */
  createFolder(
    agentPath: string,
    folderName: string,
  ): Promise<{ created: string }>;
  /** Move an entry into another folder (`null` = the workspace root). */
  moveProjectFile(
    agentPath: string,
    relPath: string,
    toDir: string | null,
  ): Promise<void>;
  /** Write ONE already-framed batch into the workspace (`targetDir` = subfolder). */
  uploadProjectFiles(
    agentPath: string,
    files: FileUpload[],
    targetDir?: string | null,
  ): Promise<void>;
  /** Write ONE already-framed batch of composer attachments; answers their paths. */
  saveAttachments(
    agentId: string,
    scopeId: string,
    files: FileUpload[],
  ): Promise<string[]>;
}

export function createFilesModule(ctx: ModuleContext): FilesModule {
  const { authExpiry } = ctx;
  const { baseUrl, ports } = ctx.config;

  const scope: HttpScope = {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized: () => authExpiry.notifyExpired(),
    fail: (message, status) =>
      new FilesHttpError(message || `files request failed: ${status}`, status),
  };

  ctx.registerCommand(FilesCommand.List, (p) =>
    listProjectFiles(scope, requireString(p, "agentPath")),
  );
  ctx.registerCommand(FilesCommand.Read, (p) =>
    readProjectFile(
      scope,
      requireString(p, "agentPath"),
      requireString(p, "relPath"),
    ),
  );
  ctx.registerCommand(FilesCommand.Delete, (p) =>
    deleteFile(
      scope,
      requireString(p, "agentPath"),
      requireString(p, "relPath"),
    ),
  );
  ctx.registerCommand(FilesCommand.Rename, (p) =>
    renameFile(
      scope,
      requireString(p, "agentPath"),
      requireString(p, "relPath"),
      requireString(p, "newName"),
    ),
  );
  ctx.registerCommand(FilesCommand.CreateFolder, (p) =>
    createFolder(
      scope,
      requireString(p, "agentPath"),
      requireString(p, "folderName"),
    ),
  );
  ctx.registerCommand(FilesCommand.Move, (p) =>
    moveProjectFile(
      scope,
      requireString(p, "agentPath"),
      requireString(p, "relPath"),
      nullableString(p, "toDir"),
    ),
  );
  ctx.registerCommand(FilesCommand.Upload, (p) =>
    uploadProjectFiles(
      scope,
      requireString(p, "agentPath"),
      requireUploads(p, "files"),
      nullableString(p, "targetDir"),
    ),
  );
  ctx.registerCommand(FilesCommand.SaveAttachments, (p) =>
    saveAttachments(
      scope,
      requireString(p, "agentId"),
      requireString(p, "scopeId"),
      requireUploads(p, "files"),
    ),
  );

  return {
    listProjectFiles: (agentPath) => listProjectFiles(scope, agentPath),
    readProjectFile: (agentPath, relPath) =>
      readProjectFile(scope, agentPath, relPath),
    deleteFile: (agentPath, relPath) => deleteFile(scope, agentPath, relPath),
    renameFile: (agentPath, relPath, newName) =>
      renameFile(scope, agentPath, relPath, newName),
    createFolder: (agentPath, folderName) =>
      createFolder(scope, agentPath, folderName),
    moveProjectFile: (agentPath, relPath, toDir) =>
      moveProjectFile(scope, agentPath, relPath, toDir),
    uploadProjectFiles: (agentPath, files, targetDir) =>
      uploadProjectFiles(scope, agentPath, files, targetDir),
    saveAttachments: (agentId, scopeId, files) =>
      saveAttachments(scope, agentId, scopeId, files),
  };
}
