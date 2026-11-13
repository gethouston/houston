import type { OpenUploadRequest, UploadSession } from "@houston/wire-types";
import type { classifyPreviewRefusal, previewPlan } from "./preview";
import type { ResumableUploadOptions } from "./resumable-upload";
import type { ProjectFile, UploadBatchOptions, UploadInput } from "./types";

/** The typed facade for an agent's workspace files. Every call throws on a non-2xx. */
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
  /** Choose the download representation this deployment can preview. */
  previewPlan: typeof previewPlan;
  /** Download a PDF with the bounded capacity retry schedule. */
  loadPreview<T>(download: () => Promise<T>): Promise<T>;
  /** Classify a PDF refusal for fallback and diagnostic reporting. */
  classifyPreviewRefusal: typeof classifyPreviewRefusal;
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
  /** Transfer and commit one batch into the workspace (`targetDir` = subfolder). */
  uploadProjectFiles(
    agentPath: string,
    files: UploadInput[],
    targetDir?: string | null,
    opts?: UploadBatchOptions,
  ): Promise<void>;
  /** Transfer and commit one batch of composer attachments; answers their paths. */
  saveAttachments(
    agentId: string,
    scopeId: string,
    files: UploadInput[],
    opts?: UploadBatchOptions,
  ): Promise<string[]>;
}
