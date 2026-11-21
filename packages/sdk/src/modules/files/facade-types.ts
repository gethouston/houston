import type { OpenUploadRequest, UploadSession } from "@houston/wire-types";
import type { classifyPreviewRefusal, previewPlan } from "./preview";
import type { ResumableUploadOptions } from "./resumable-upload";
import type { ProjectFile, UploadBatchOptions, UploadInput } from "./types";

export interface FilesModule {
  openUpload(
    agentId: string,
    request: OpenUploadRequest,
    signal?: AbortSignal,
  ): Promise<UploadSession>;
  upload(
    agentId: string,
    blob: Blob,
    opts: ResumableUploadOptions,
  ): Promise<{ uploadId: string }>;
  previewPlan: typeof previewPlan;
  loadPreview<T>(download: () => Promise<T>): Promise<T>;
  classifyPreviewRefusal: typeof classifyPreviewRefusal;
  listProjectFiles(agentPath: string): Promise<ProjectFile[]>;
  readProjectFile(agentPath: string, relPath: string): Promise<string>;
  deleteFile(agentPath: string, relPath: string): Promise<void>;
  renameFile(
    agentPath: string,
    relPath: string,
    newName: string,
  ): Promise<void>;
  createFolder(
    agentPath: string,
    folderName: string,
  ): Promise<{ created: string }>;
  moveProjectFile(
    agentPath: string,
    relPath: string,
    toDir: string | null,
  ): Promise<void>;
  uploadProjectFiles(
    agentPath: string,
    files: UploadInput[],
    targetDir?: string | null,
    opts?: UploadBatchOptions,
  ): Promise<void>;
  saveAttachments(
    agentId: string,
    scopeId: string,
    files: UploadInput[],
    opts?: UploadBatchOptions,
  ): Promise<string[]>;
}
