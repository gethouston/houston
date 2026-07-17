// --- Files browser ---

export interface FileEntry {
  /** Relative path from workspace root (e.g., "docs/readme.md") */
  path: string;
  /** File name with extension */
  name: string;
  /** File extension without dot (e.g., "md", "pdf") */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Whether this entry is a directory */
  is_directory?: boolean;
  /** Last modified timestamp in milliseconds (Date.now() format) */
  dateModified?: number;
  /** Creation timestamp in milliseconds (Date.now() format) */
  dateCreated?: number;
}

/** Data a card thumbnail renders — resolved lazily per visible card. */
export type FilePreviewData =
  | { kind: "image"; blob: Blob }
  | { kind: "text"; text: string };

/**
 * Injected by the app: fetch preview bytes for one file. Resolve null (or
 * reject) to fall back to the type icon — the card treats failure as "no
 * thumbnail", never as an error surface.
 */
export type LoadFilePreview = (
  file: FileEntry,
) => Promise<FilePreviewData | null>;

export type FilesViewMode = "grid" | "list";

// --- Instructions panel ---

export interface InstructionFile {
  /** File name (e.g., "CLAUDE.md") */
  name: string;
  /** Human-readable label shown above the field (e.g., "CLAUDE.md") */
  label: string;
  /** Current file content */
  content: string;
}
