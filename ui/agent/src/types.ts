export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory?: boolean;
  dateModified?: number;
  dateCreated?: number;
}

export type FilePreviewData =
  | { kind: "image"; blob: Blob }
  | { kind: "text"; text: string };

export type LoadFilePreview = (
  file: FileEntry,
) => Promise<FilePreviewData | null>;
