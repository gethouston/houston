import {
  type CommittedUploadFile,
  committedUploadFileSchema,
} from "@houston/wire-types";
import { field, requireString } from "../payload";

/**
 * One entry of an agent's workspace listing. Snake-cased because it is the
 * host's wire shape, rendered as-is by the Files section.
 */
export interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  /** Last modification time in milliseconds since the UNIX epoch. Omitted
   *  when the filesystem doesn't expose mtime for the entry. */
  date_modified?: number;
  /** Creation time in milliseconds since the UNIX epoch. Omitted when the
   *  storage backend doesn't report one (e.g. Linux without birthtime). */
  date_created?: number;
}

/**
 * One file to upload: its name, its bytes already base64-framed, and — for a
 * file picked as part of a folder — the relative path that keeps it nested
 * under its folder. Hosts predating folder support ignore `relPath` and store
 * the flat name.
 */
export interface FileUpload {
  name: string;
  contentBase64: string;
  relPath?: string;
}

/** A device file whose framing and transfer policy belongs to the SDK. */
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

/**
 * Where one file's upload stands. `reconnecting` means a dropped
 * connection is being resumed from the bytes storage already holds; `saving`
 * is the commit call that turns the staged upload into a workspace file.
 */
export interface UploadProgress {
  sentBytes: number;
  totalBytes: number;
  phase: "uploading" | "reconnecting" | "saving" | "done";
}

/** What an upload's caller can watch and cancel it by. */
export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/** The write vocabulary — the same constants back the facade and `dispatch`. */
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
