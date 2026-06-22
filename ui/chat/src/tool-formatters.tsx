/**
 * Per-tool formatting for ToolBlock content display.
 *
 * Maps tool names to icons, detail strings, and formatted result components.
 * Designed for non-technical users: friendly labels, clean code blocks,
 * smart truncation. No Houston-specific logic.
 */

import type { ComponentType } from "react";
import {
  TerminalIcon,
  FileTextIcon,
  PencilIcon,
  FilePlusIcon,
  SearchIcon,
  FolderSearchIcon,
  GlobeIcon,
  DownloadIcon,
  WrenchIcon,
} from "lucide-react";
export { ToolContent } from "./tool-content";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

type LucideIcon = ComponentType<{ className?: string }>;

const TOOL_ICONS: Record<string, LucideIcon> = {
  Bash: TerminalIcon,
  Read: FileTextIcon,
  Edit: PencilIcon,
  Write: FilePlusIcon,
  Grep: SearchIcon,
  Glob: FolderSearchIcon,
  WebSearch: GlobeIcon,
  WebFetch: DownloadIcon,
};

export function getToolIcon(name: string): LucideIcon {
  const short = name.includes("__") ? (name.split("__").pop() ?? name) : name;
  return TOOL_ICONS[short] ?? WrenchIcon;
}

// ---------------------------------------------------------------------------
// Detail strings (shown in header next to label)
// ---------------------------------------------------------------------------

export function getToolDetail(name: string, input: unknown): string | null {
  const inp = input as Record<string, unknown> | null | undefined;
  if (!inp) return null;
  const short = name.includes("__") ? (name.split("__").pop() ?? name) : name;

  switch (short) {
    case "Bash": {
      const cmd = inp.command as string | undefined;
      if (!cmd) return null;
      return cmd.length > 80 ? `${cmd.slice(0, 77)}...` : cmd;
    }
    case "Read":
    case "Write":
    case "Edit":
      return shortPath(inp.file_path as string | undefined);
    case "Grep":
    case "Glob":
      return (inp.pattern as string | undefined) ?? null;
    case "WebSearch":
      return (inp.query as string | undefined) ?? null;
    case "WebFetch":
      return shortUrl(inp.url as string | undefined);
    default:
      return null;
  }
}

function shortPath(fp: string | undefined): string | null {
  if (!fp) return null;
  const parts = fp.split("/");
  return parts.length > 2 ? parts.slice(-2).join("/") : fp;
}

function shortUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return url.length > 60 ? `${url.slice(0, 57)}...` : url;
  }
}
