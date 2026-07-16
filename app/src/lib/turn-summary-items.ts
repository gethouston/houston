import type { FileChangeEntry, ToolEntry } from "@houston-ai/chat";
import { fileNameOf, toWorkspaceRelative } from "./agent-file-paths";

export type SemanticUpdateKind = "instructions" | "skills" | "learnings";
export type FileUpdateKind = "created" | "modified";

export type TurnSummaryItem =
  | { kind: "file"; path: string; change: FileUpdateKind }
  | { kind: "semantic"; update: SemanticUpdateKind };

export interface TurnSummaryGroups {
  updates: TurnSummaryItem[];
  files: Extract<TurnSummaryItem, { kind: "file" }>[];
}

const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const USER_FILE_EXTENSIONS = new Set([
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "gif",
  "txt",
  "rtf",
  "csv",
  // Plain-text formats agents routinely write as user-visible output. `md`
  // is the one that prompted this: a real user reported a `perfil.md`
  // from the agent never showed up in the "New files" section because md
  // wasn't on this allowlist (it was rejected on every OS, the Windows
  // separator bugs just made it harder to notice).
  "md",
  "markdown",
  "html",
  "json",
  "yaml",
  "yml",
]);

function shortName(name: string): string {
  return name.includes("__") ? (name.split("__").pop() ?? name) : name;
}

function classifyPath(
  path: string,
  agentPath: string,
): SemanticUpdateKind | null {
  // Separator handling matters here: the engine emits absolute paths in the
  // HOST's native separator, so a plain `path.split("/").pop()` returned the
  // whole path on Windows — the "New files" section never rendered correctly
  // and CLAUDE.md / SKILL.md never classified as semantic updates. The shared
  // helpers in agent-file-paths.ts are separator-agnostic.
  const relative = toWorkspaceRelative(path, {
    folderPath: agentPath,
  }).toLowerCase();
  const fileName = fileNameOf(relative);

  if (fileName === "claude.md" || fileName === "agents.md")
    return "instructions";
  if (relative === ".houston/learnings/learnings.json") return "learnings";
  if (
    relative.startsWith(".agents/skills/") ||
    relative.startsWith(".claude/skills/") ||
    relative.includes("/.agents/skills/") ||
    relative.includes("/.claude/skills/")
  ) {
    return "skills";
  }
  if (fileName === "skill.md" || fileName === "skills.md") return "skills";
  return null;
}

export function isUserVisibleFilePath(path: string): boolean {
  const fileName = fileNameOf(path);
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : "";
  return Boolean(ext && USER_FILE_EXTENSIONS.has(ext));
}

function extractPathsFromBashOutput(output: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const p = raw.trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  };

  const labeled =
    /(?:saved|created|wrote|written|output|file):\s*([^\r\n]+\.[a-zA-Z0-9]{1,10})/gi;
  for (
    let match = labeled.exec(output);
    match !== null;
    match = labeled.exec(output)
  ) {
    add(match[1]);
  }

  const bare = /^(\/[^\r\n]+\.[a-zA-Z0-9]{1,10})\s*$/gm;
  for (
    let match = bare.exec(output);
    match !== null;
    match = bare.exec(output)
  ) {
    add(match[1]);
  }

  return paths;
}

export function buildTurnSummaryItems(
  tools: ToolEntry[],
  agentPath: string,
  fileChanges: FileChangeEntry[] = [],
): TurnSummaryItem[] {
  const semantic = new Set<SemanticUpdateKind>();
  const files: Array<{ path: string; change: FileUpdateKind }> = [];
  const seenFiles = new Map<string, FileUpdateKind>();

  const addPath = (path: string, change: FileUpdateKind) => {
    const update = classifyPath(path, agentPath);
    if (update) {
      semantic.add(update);
      return;
    }
    if (!isUserVisibleFilePath(path)) return;

    const existing = seenFiles.get(path);
    if (existing === "created" || existing === change) return;
    if (existing === "modified" && change === "created") {
      seenFiles.set(path, change);
      const item = files.find((file) => file.path === path);
      if (item) item.change = change;
      return;
    }
    seenFiles.set(path, change);
    files.push({ path, change });
  };

  for (const change of fileChanges) {
    addPath(change.path, change.status);
  }

  for (const tool of tools) {
    if (!tool.result || tool.result.is_error) continue;
    const sn = shortName(tool.name);

    if (FILE_TOOLS.has(sn)) {
      const inp = tool.input as Record<string, unknown> | null | undefined;
      // Claude tools carry `file_path`; pi tools carry `path`.
      const fp = (inp?.file_path ?? inp?.path) as string | undefined;
      if (fp) addPath(fp, sn === "Write" ? "created" : "modified");
    } else if (sn === "Bash") {
      for (const fp of extractPathsFromBashOutput(tool.result.content)) {
        addPath(fp, "created");
      }
    }
  }

  return [
    ...Array.from(semantic).map((update) => ({
      kind: "semantic" as const,
      update,
    })),
    ...files.map((file) => ({ kind: "file" as const, ...file })),
  ];
}

export function groupTurnSummaryItems(
  items: TurnSummaryItem[],
): TurnSummaryGroups {
  return {
    updates: items.filter(
      (item) => item.kind === "semantic" || item.change === "modified",
    ),
    files: items.filter(isCreatedFile),
  };
}

function isCreatedFile(
  item: TurnSummaryItem,
): item is Extract<TurnSummaryItem, { kind: "file" }> {
  return item.kind === "file" && item.change === "created";
}
