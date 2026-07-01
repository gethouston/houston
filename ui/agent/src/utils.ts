/**
 * Finder-style formatting and sorting utilities.
 */
import type { FileNode, FolderNode } from "./tree";

/** Format bytes like Finder (SI units: 1000, not 1024). */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "Zero bytes";
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1000000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1000000000) return `${(bytes / 1000000).toFixed(1)} MB`;
  return `${(bytes / 1000000000).toFixed(1)} GB`;
}

/** Format a timestamp like Finder: "Today at 3:24 PM", "Yesterday", "Apr 3 at 2:30 PM". */
export function formatFileManagerDate(timestamp?: number): string {
  if (!timestamp) return "\u2014";
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (date >= today) return `Today at ${time}`;
  if (date >= yesterday) return `Yesterday at ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return (
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      ` at ${time}`
    );
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const KIND_MAP: Record<string, string> = {
  pdf: "PDF Document",
  md: "Markdown",
  txt: "Plain Text",
  rtf: "Rich Text Document",
  png: "PNG Image",
  jpg: "JPEG Image",
  jpeg: "JPEG Image",
  gif: "GIF Image",
  svg: "SVG Image",
  webp: "WebP Image",
  heic: "HEIC Image",
  mp3: "MP3 Audio",
  wav: "WAV Audio",
  aac: "AAC Audio",
  mp4: "MPEG-4 Movie",
  mov: "QuickTime Movie",
  json: "JSON",
  js: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript JSX",
  jsx: "JavaScript JSX",
  css: "CSS Stylesheet",
  html: "HTML Document",
  xml: "XML Document",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  rs: "Rust Source",
  py: "Python Script",
  go: "Go Source",
  rb: "Ruby Script",
  sh: "Shell Script",
  zip: "ZIP Archive",
  gz: "GZ Archive",
  tar: "Tar Archive",
  dmg: "Apple Disk Image",
  xlsx: "Excel Spreadsheet",
  xls: "Excel Spreadsheet",
  csv: "CSV Document",
  doc: "Word Document",
  docx: "Word Document",
};

/** Get Finder-style "Kind" string from file extension. */
export function getKind(extension: string): string {
  return KIND_MAP[extension.toLowerCase()] || `${extension.toUpperCase()} File`;
}

// --- Sort ---

export type SortKey = "name" | "dateModified" | "size" | "kind";
export type SortDirection = "asc" | "desc";

/** Recursively sort a tree (folders first, then by selected column). */
export function sortTree(
  node: FolderNode,
  key: SortKey,
  direction: SortDirection,
): FolderNode {
  const sorted = [...node.children].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    if (a.kind === "folder" && b.kind === "folder") {
      const cmp = a.name.localeCompare(b.name);
      return direction === "asc" ? cmp : -cmp;
    }
    const fa = (a as FileNode).entry;
    const fb = (b as FileNode).entry;
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = fa.name.localeCompare(fb.name);
        break;
      case "dateModified":
        cmp = (fa.dateModified ?? 0) - (fb.dateModified ?? 0);
        break;
      case "size":
        cmp = fa.size - fb.size;
        break;
      case "kind":
        cmp = getKind(fa.extension).localeCompare(getKind(fb.extension));
        break;
    }
    return direction === "asc" ? cmp : -cmp;
  });
  return {
    ...node,
    children: sorted.map((c) =>
      c.kind === "folder" ? sortTree(c, key, direction) : c,
    ),
  };
}
