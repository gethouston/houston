export const UNSAVED_FILE_REASONS = [
  "conflict_copy",
  "conflict",
  "delete_kept",
  "too_large",
  "out_of_scope",
] as const;

export type UnsavedFileReason = (typeof UNSAVED_FILE_REASONS)[number];

export const MAX_UNSAVED_FILES = 20;
export const MAX_UNSAVED_PATH = 512;

export interface UnsavedFile {
  path: string;
  reason: UnsavedFileReason;
  copyPath?: string;
  internal?: true;
}

export interface UnsavedFilesReport {
  files: UnsavedFile[];
  total: number;
  counts: Partial<Record<UnsavedFileReason, number>>;
}
