/**
 * Per-tool formatting for ToolBlock content display.
 *
 * Maps tool names to icons, detail strings, and formatted result components.
 * Designed for non-technical users: friendly labels, clean code blocks,
 * smart truncation. No Houston-specific logic.
 */

import {
  DownloadIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderSearchIcon,
  GlobeIcon,
  PencilIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";

export { ToolContent } from "./tool-content";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

type LucideIcon = ComponentType<{ className?: string }>;

// Claude tool names (PascalCase) AND pi coding-agent names (lowercase) — both
// dialects reach this map, so both get real icons instead of the wrench.
const TOOL_ICONS: Record<string, LucideIcon> = {
  Bash: TerminalIcon,
  Read: FileTextIcon,
  Edit: PencilIcon,
  Write: FilePlusIcon,
  Grep: SearchIcon,
  Glob: FolderSearchIcon,
  WebSearch: GlobeIcon,
  WebFetch: DownloadIcon,
  bash: TerminalIcon,
  read: FileTextIcon,
  edit: PencilIcon,
  write: FilePlusIcon,
  grep: SearchIcon,
  find: FolderSearchIcon,
  ls: FolderIcon,
};

/**
 * The per-tool icon for a tool name, or undefined when the name isn't one we
 * map (so callers can choose their own fallback — the process-block header
 * keeps the Houston helmet rather than showing a generic wrench).
 */
export function getMappedToolIcon(name: string): LucideIcon | undefined {
  const short = name.includes("__") ? (name.split("__").pop() ?? name) : name;
  return TOOL_ICONS[short];
}

export function getToolIcon(name: string): LucideIcon {
  return getMappedToolIcon(name) ?? WrenchIcon;
}

// ---------------------------------------------------------------------------
// Detail strings (shown in header next to label)
// ---------------------------------------------------------------------------

export function getToolDetail(name: string, input: unknown): string | null {
  const inp = input as Record<string, unknown> | null | undefined;
  if (!inp) return null;
  const short = name.includes("__") ? (name.split("__").pop() ?? name) : name;

  switch (short) {
    case "Bash":
    case "bash": {
      const cmd = inp.command as string | undefined;
      if (!cmd) return null;
      return cmd.length > 80 ? `${cmd.slice(0, 77)}...` : cmd;
    }
    // Claude's file tools carry `file_path`; pi's carry `path`.
    case "Read":
    case "Write":
    case "Edit":
    case "read":
    case "write":
    case "edit":
      return shortPath((inp.file_path ?? inp.path) as string | undefined);
    case "Grep":
    case "Glob":
    case "grep":
    case "find":
      return (inp.pattern as string | undefined) ?? null;
    case "ls":
      return shortPath(inp.path as string | undefined);
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
