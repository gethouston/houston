import {
  DownloadIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderSearchIcon,
  GlobeIcon,
  KanbanSquareIcon,
  PencilIcon,
  RocketIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { commandActivityOf } from "./command-activity";
import type { ToolEntry } from "./feed-to-messages";
import { PythonIcon } from "./python-icon";

export { ToolContent } from "./tool-content";

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
  bash: TerminalIcon,
  read: FileTextIcon,
  edit: PencilIcon,
  write: FilePlusIcon,
  grep: SearchIcon,
  find: FolderSearchIcon,
  ls: FolderIcon,
  run_code: TerminalIcon,
  browser: GlobeIcon,
  start_mission: RocketIcon,
  list_missions: KanbanSquareIcon,
  read_mission: KanbanSquareIcon,
  update_mission_status: KanbanSquareIcon,
};

export function getMappedToolIcon(name: string): LucideIcon | undefined {
  const short = name.includes("__") ? (name.split("__").pop() ?? name) : name;
  return TOOL_ICONS[short];
}

export function getToolIcon(name: string): LucideIcon {
  return getMappedToolIcon(name) ?? WrenchIcon;
}

export function getToolEntryIcon(
  tool: Pick<ToolEntry, "name" | "input">,
): LucideIcon {
  const activity = commandActivityOf(tool);
  if (activity) return activity.kind === "web" ? GlobeIcon : PythonIcon;
  return getToolIcon(tool.name);
}

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
    case "browser":
      return inp.action === "open" || inp.action === "handoff"
        ? shortUrl(inp.url as string | undefined)
        : null;
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
