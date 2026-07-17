/**
 * Pure file-type classification shared by the grid cards, the legacy list
 * icons and the app-side preview loader. No React here — unit-testable.
 */

export type FileCategory =
  | "pdf"
  | "image"
  | "code"
  | "sheet"
  | "archive"
  | "audio"
  | "video"
  | "doc"
  | "data"
  | "other";

export const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
  "tiff",
  "heic",
]);

export const CODE_EXT = new Set([
  "js",
  "ts",
  "tsx",
  "jsx",
  "rs",
  "py",
  "go",
  "rb",
  "sh",
  "c",
  "cpp",
  "h",
  "java",
  "swift",
  "kt",
  "html",
  "css",
  "scss",
  "vue",
  "svelte",
]);

export const SHEET_EXT = new Set(["xlsx", "xls", "csv", "numbers", "ods"]);

export const ARCHIVE_EXT = new Set([
  "zip",
  "gz",
  "tar",
  "7z",
  "rar",
  "dmg",
  "iso",
]);

export const AUDIO_EXT = new Set(["mp3", "wav", "aac", "flac", "m4a", "ogg"]);

export const VIDEO_EXT = new Set(["mp4", "mov", "mkv", "webm", "avi"]);

export const DOC_EXT = new Set(["md", "txt", "rtf", "doc", "docx", "pages"]);

export const DATA_EXT = new Set(["json", "yaml", "yml", "toml", "xml", "log"]);

/** Classify an extension (without dot) into a coarse category. */
export function fileCategory(extension: string): FileCategory {
  const ext = extension.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  if (CODE_EXT.has(ext)) return "code";
  if (SHEET_EXT.has(ext)) return "sheet";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  if (DOC_EXT.has(ext)) return "doc";
  if (DATA_EXT.has(ext)) return "data";
  return "other";
}

/** Don't fetch card thumbnails for images larger than this. */
export const IMAGE_PREVIEW_MAX_BYTES = 10_000_000;
/** Don't fetch text minipreviews for files larger than this. */
export const TEXT_PREVIEW_MAX_BYTES = 512_000;
/** How much text a card minipreview needs — the first page's worth. */
export const TEXT_PREVIEW_SLICE_BYTES = 4_096;

/** Extensions whose bytes render as a miniature text page on the card. */
const TEXT_PREVIEW_EXT = new Set([
  ...CODE_EXT,
  ...DATA_EXT,
  "md",
  "txt",
  "csv",
]);

/**
 * Which card preview a file can get: an image thumbnail, a miniature text
 * page, or none (type icon only). Size-capped so the grid never pulls huge
 * blobs just to paint a thumbnail.
 */
export function previewKind(file: {
  extension: string;
  size: number;
  is_directory?: boolean;
}): "image" | "text" | null {
  if (file.is_directory) return null;
  const ext = file.extension.toLowerCase();
  if (IMAGE_EXT.has(ext)) {
    return file.size <= IMAGE_PREVIEW_MAX_BYTES ? "image" : null;
  }
  if (TEXT_PREVIEW_EXT.has(ext)) {
    return file.size <= TEXT_PREVIEW_MAX_BYTES ? "text" : null;
  }
  return null;
}
