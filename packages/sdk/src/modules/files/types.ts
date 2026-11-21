import {
  type CommittedUploadFile,
  committedUploadFileSchema,
} from "@houston/wire-types";
import { field, requireString } from "../payload";

export interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  date_modified?: number;
  date_created?: number;
}

export interface FileUpload {
  name: string;
  contentBase64: string;
  relPath?: string;
}

export interface BlobUpload {
  name: string;
  blob: Blob;
  relPath?: string;
}

export type UploadEntry =
  | FileUpload
  | Pick<CommittedUploadFile, "name" | "relPath" | "uploadId">;
export type UploadInput = UploadEntry | BlobUpload;
export interface UploadBatchOptions {
  signal?: AbortSignal;
  onProgress?: (file: UploadInput, progress: UploadProgress) => void;
}

export interface UploadProgress {
  sentBytes: number;
  totalBytes: number;
  phase: "uploading" | "reconnecting" | "saving" | "done";
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export const FilesCommand = {
  List: "files/list",
  Read: "files/read",
  Delete: "files/delete",
  Rename: "files/rename",
  CreateFolder: "files/createFolder",
  Move: "files/move",
  Upload: "files/upload",
  SaveAttachments: "files/saveAttachments",
  OpenUpload: "files/openUpload",
} as const;

export type FilesCommandType = (typeof FilesCommand)[keyof typeof FilesCommand];

export function nullableString(payload: unknown, key: string): string | null {
  const value = field(payload, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`'${key}' must be a string`);
  return value;
}

export function requireUploads(payload: unknown, key: string): UploadEntry[] {
  const value = field(payload, key);
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`'${key}' must be a non-empty array of files`);
  }
  return value.map((raw, index) => {
    const name = requireString(raw, "name");
    if (field(raw, "uploadId") !== undefined) {
      return committedUploadFileSchema.parse(raw);
    }
    const contentBase64 = field(raw, "contentBase64");
    if (typeof contentBase64 !== "string") {
      throw new Error(`'${key}'[${index}] needs a string contentBase64`);
    }
    const relPath = field(raw, "relPath");
    if (relPath !== undefined && typeof relPath !== "string") {
      throw new Error(`'${key}'[${index}] relPath must be a string`);
    }
    return { name, contentBase64, relPath };
  });
}
