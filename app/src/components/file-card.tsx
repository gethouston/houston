import {
  ExternalLinkIcon,
  EyeIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useOpenAgentFile } from "../hooks/use-open-agent-file";
import { fileNameOf } from "../lib/agent-file-paths";

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
  const fileName = fileNameOf(filePath);
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  const Icon = getFileIcon(ext);
  const { openFile, opensLocally } = useOpenAgentFile(agentPath);
  // The affordance mirrors what the click does: hand off to the OS
  // (external-link) or open the in-app preview dialog (eye).
  const ActionIcon = opensLocally ? ExternalLinkIcon : EyeIcon;

  return (
    <button
      type="button"
      onClick={() => openFile(filePath)}
      className="inline-flex items-center gap-2 rounded-lg border border-line/50 bg-chip px-3 py-2 text-sm hover:bg-hover transition-colors cursor-pointer"
    >
      <Icon className="h-4 w-4 text-ink-muted shrink-0" />
      <span className="truncate max-w-[240px]">{fileName}</span>
      <ActionIcon className="h-3.5 w-3.5 text-ink-muted shrink-0 ml-1" />
    </button>
  );
}
