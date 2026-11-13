/**
 * The files module — an agent's REAL workspace: what is in it, what one file
 * says, and every rearrangement of it, plus the two upload routes that put new
 * bytes there.
 *
 * These are pure commands: the Files section opens them, reads once, and writes
 * from a menu; no host event invalidates the listing and nothing renders it
 * continuously, so there is no reactive scope to publish. The same handlers
 * back both the typed facade and the `dispatch` path.
 *
 * SEAM — per-agent, but NOT through `clientFor(agentId)`. The runtime client is
 * scoped to one conversation and serves none of the `/agents/:id/files*`
 * family, so the module talks to those host routes through the SDK's own HTTP
 * seam. A 401 routes through the shared {@link ModuleContext.authExpiry}
 * notifier, which that seam signals.
 *
 * Binary preview policy belongs to this facade; transport returns the bytes
 * through the adapter while surfaces render the chosen fallback.
 */

import { openUploadRequestSchema } from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { moduleScope } from "../http";
import { field, requireString } from "../payload";
import type { FilesModule } from "./facade-types";
import {
  createFolder,
  deleteFile,
  FilesHttpError,
  listProjectFiles,
  moveProjectFile,
  readProjectFile,
  renameFile,
} from "./http";
import { openUpload } from "./open-upload";
import { classifyPreviewRefusal, loadPreview, previewPlan } from "./preview";
import { upload } from "./resumable-upload";
import { FilesCommand, nullableString, requireUploads } from "./types";
import { saveAttachmentBatch, uploadFileBatch } from "./upload-batches";

export type { FilesModule } from "./facade-types";
export { FilesHttpError } from "./http";
export type { ResumableUploadOptions } from "./resumable-upload";
export type {
  BlobUpload,
  FilesCommandType,
  FileUpload,
  ProjectFile,
  UploadBatchOptions,
  UploadEntry,
  UploadInput,
  UploadOptions,
  UploadProgress,
} from "./types";
export { FilesCommand } from "./types";
export {
  UploadRefusalError,
  UploadSessionsUnavailableError,
  UploadTransferError,
} from "./upload-errors";
export {
  isUploadInterruptedError,
  UploadInterruptedError,
  type UploadRoute,
} from "./upload-interrupted";

export function createFilesModule(ctx: ModuleContext): FilesModule {
  const scope = moduleScope(ctx, "files", FilesHttpError);

  ctx.registerCommand(FilesCommand.OpenUpload, (p) =>
    openUpload(
      scope,
      requireString(p, "agentId"),
      openUploadRequestSchema.parse(field(p, "request")),
    ),
  );
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
    uploadFileBatch(
      scope,
      requireString(p, "agentPath"),
      requireUploads(p, "files"),
      nullableString(p, "targetDir"),
    ),
  );
  ctx.registerCommand(FilesCommand.SaveAttachments, (p) =>
    saveAttachmentBatch(
      scope,
      requireString(p, "agentId"),
      requireString(p, "scopeId"),
      requireUploads(p, "files"),
    ),
  );

  return {
    openUpload: (agentId, request, signal) =>
      openUpload(scope, agentId, request, signal),
    upload: (agentId, blob, opts) => upload(scope, agentId, blob, opts),
    /** Choose the preview representation.
     * @assistant group:files hidden: local preview policy; no host request.
     * @assistant unroutable: pure representation selection. */
    previewPlan(fileName, capabilities) {
      return previewPlan(fileName, capabilities);
    },
    /** Classify a preview failure.
     * @assistant group:files hidden: local reporting policy; no host request.
     * @assistant unroutable: pure refusal classification. */
    classifyPreviewRefusal(error, capabilities) {
      return classifyPreviewRefusal(error, capabilities);
    },
    /** Retry a binary preview through its transport callback.
     * @assistant group:files hidden: binary preview retry policy.
     * @assistant unroutable: transport callback owns the download route. */
    loadPreview: (download) => loadPreview(download, ctx.config.ports.clock),
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
    /** Import a device batch.
     * @assistant group:files hidden: the Files picker supplies binary data.
     * @assistant unroutable: composes session transfer and the files commit. */
    uploadProjectFiles: (agentPath, files, targetDir, opts) =>
      uploadFileBatch(scope, agentPath, files, targetDir, opts),
    /** Save a device attachment batch.
     * @assistant group:attachments hidden: the composer supplies binary data.
     * @assistant unroutable: composes session transfer and the attachment commit. */
    saveAttachments: (agentId, scopeId, files, opts) =>
      saveAttachmentBatch(scope, agentId, scopeId, files, opts),
  };
}
