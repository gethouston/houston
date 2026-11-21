export type FileCategory =
  | "pdf"
  | "image"
  | "code"
  | "sheet"
  | "slide"
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
  "tif",
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

export const SLIDE_EXT = new Set(["ppt", "pptx", "key", "odp"]);

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

export function fileCategory(extension: string): FileCategory {
  const ext = extension.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  if (CODE_EXT.has(ext)) return "code";
  if (SHEET_EXT.has(ext)) return "sheet";
  if (SLIDE_EXT.has(ext)) return "slide";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  if (DOC_EXT.has(ext)) return "doc";
  if (DATA_EXT.has(ext)) return "data";
  return "other";
}

export const IMAGE_PREVIEW_MAX_BYTES = 10_000_000;
export const TEXT_PREVIEW_MAX_BYTES = 512_000;
export const TEXT_PREVIEW_SLICE_BYTES = 4_096;

const TEXT_PREVIEW_EXT = new Set([
  ...CODE_EXT,
  ...DATA_EXT,
  "md",
  "txt",
  "csv",
]);

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
