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
}

// --- Instructions panel ---

export interface InstructionFile {
  /** File name (e.g., "CLAUDE.md") */
  name: string;
  /** Human-readable label shown above the field (e.g., "CLAUDE.md") */
  label: string;
  /** Current file content */
  content: string;
}
