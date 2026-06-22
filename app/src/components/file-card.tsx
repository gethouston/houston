import { useCallback } from "react";
import {
  FileIcon,
  FileTextIcon,
  FileCodeIcon,
  ImageIcon,
  ExternalLinkIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { tauriFiles } from "../lib/tauri";

type LucideIcon = ComponentType<{ className?: string }>;

const CODE_EXTS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rs",
  "go",
  "rb",
  "java",
  "c",
  "cpp",
  "h",
  "css",
  "scss",
  "html",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "sh",
  "bash",
  "swift",
  "kt",
  "lua",
  "zig",
  "sql",
  "graphql",
  "vue",
  "svelte",
]);

const TEXT_EXTS = new Set(["md", "txt", "doc", "docx", "rtf", "csv", "log"]);

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
]);

export function getFileIcon(ext?: string): LucideIcon {
  if (!ext) return FileIcon;
  if (CODE_EXTS.has(ext)) return FileCodeIcon;
  if (TEXT_EXTS.has(ext)) return FileTextIcon;
  if (IMAGE_EXTS.has(ext)) return ImageIcon;
  return FileIcon;
}

interface FileCardProps {
  filePath: string;
  agentPath: string;
}

export function FileCard({ filePath, agentPath }: FileCardProps) {
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  const Icon = getFileIcon(ext);

  const handleOpen = useCallback(() => {
    tauriFiles.open(agentPath, filePath).catch(console.error);
  }, [agentPath, filePath]);

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-secondary px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="truncate max-w-[240px]">{fileName}</span>
      <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
    </button>
  );
}
