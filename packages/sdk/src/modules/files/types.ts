/**
 * Wire types for an agent's workspace files — the listing entries, the upload
 * frame, and the command vocabulary the bridge dispatches them by.
 *
 * The upload shape is deliberately DOM-free. A browser hands the Files section
 * `File` objects and iOS hands it nothing of the sort, so the framing (reading
 * the bytes, base64-encoding them, reading `webkitRelativePath`) belongs to the
 * surface; what crosses into this module is the JSON the host already accepts.
 */

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

/** The write vocabulary — the same constants back the facade and the bridge. */
export const FilesCommand = {
  List: "files/list",
  Read: "files/read",
  Delete: "files/delete",
  Rename: "files/rename",
  CreateFolder: "files/createFolder",
  Move: "files/move",
  Upload: "files/upload",
  SaveAttachments: "files/saveAttachments",
} as const;

export type FilesCommandType = (typeof FilesCommand)[keyof typeof FilesCommand];

/** The raw value of `key` off an untrusted command payload. */
function field(payload: unknown, key: string): unknown {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

/** A required non-empty string off an untrusted command payload. */
export function requireString(payload: unknown, key: string): string {
  const value = field(payload, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

/**
 * A folder off an untrusted command payload, where absent means the workspace
 * root. `null` is the value the host reads as "the root", so an omitted key
 * resolves to it rather than to a folder literally named "undefined".
 */
export function nullableString(payload: unknown, key: string): string | null {
  const value = field(payload, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`'${key}' must be a string`);
  return value;
}

/**
 * The upload list off an untrusted command payload, checked field by field: a
 * bridge caller's malformed entry must fail here, not halfway through a batch
 * the host has already begun writing into the workspace.
 */
export function requireUploads(payload: unknown, key: string): FileUpload[] {
  const value = field(payload, key);
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`'${key}' must be a non-empty array of files`);
  }
  return value.map((raw, index) => {
    const name = requireString(raw, "name");
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
